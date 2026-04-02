///
/// Copyright © 2016-2026 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import { ChangeDetectorRef, Component, Inject, OnInit, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { MatStepper } from '@angular/material/stepper';
import { firstValueFrom } from 'rxjs';
import { PageLink } from '@shared/models/page/page-link';
import { MpItemVersionView } from '@shared/models/iot-hub/iot-hub-version.models';
import { IotHubApiService } from '@core/http/iot-hub-api.service';
import { DeviceProfileService } from '@core/http/device-profile.service';
import { DeviceService } from '@core/http/device.service';
import { DashboardService } from '@core/http/dashboard.service';
import { RuleChainService } from '@core/http/rule-chain.service';
import {
  connectivityTypeTranslations,
  DeviceInstallStep,
  DevicePackageInfo,
  ENTITY_STEP_TYPES,
  EntityStepOutput,
  EntityStepProgress,
  FormFieldDefinition,
  FormFieldType,
  InstallStepType,
  stepTypeAliasMap
} from '@shared/models/iot-hub/device-package.models';

export interface DeviceInstallDialogData {
  item: MpItemVersionView;
  zipData: ArrayBuffer;
  iotHubApiService: IotHubApiService;
}

export type WizardStepType = 'instruction' | 'form' | 'progress';

export interface WizardStep {
  type: WizardStepType;
  label: string;
  rawSteps: DeviceInstallStep[];
  completed: boolean;
  // Instruction
  markdown?: string;
  // Form
  formFields?: FormFieldDefinition[];
  formGroup?: UntypedFormGroup;
  // Progress
  entitySteps?: EntityStepProgress[];
  progressError?: string;
  progressDone?: boolean;
}

const ENTITY_STEP_MIN_DELAY = 2000;

@Component({
  selector: 'tb-device-install-dialog',
  standalone: false,
  templateUrl: './device-install-dialog.component.html',
  styleUrls: ['./device-install-dialog.component.scss']
})
export class TbDeviceInstallDialogComponent implements OnInit {

  @ViewChild('installStepper', {static: false}) stepper: MatStepper;

  loading = true;
  packageInfo: DevicePackageInfo;
  zipFiles = new Map<string, string>();

  // Connectivity
  showConnectivitySelector = false;
  availableConnectivityTypes: string[] = [];
  selectedConnectivity: string | null = null;
  connectivityLabels = connectivityTypeTranslations;

  // Wizard
  wizardSteps: WizardStep[] = [];
  wizardStarted = false;
  passwordVisible: Record<string, boolean> = {};

  // Variable resolution state
  formValues: Record<string, any> = {};
  entityOutputs = new Map<string, EntityStepOutput>();
  positionalOutputs = new Map<number, EntityStepOutput>();

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: DeviceInstallDialogData,
    private dialogRef: MatDialogRef<TbDeviceInstallDialogComponent>,
    private cdr: ChangeDetectorRef,
    private deviceProfileService: DeviceProfileService,
    private deviceService: DeviceService,
    private dashboardService: DashboardService,
    private ruleChainService: RuleChainService
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(this.data.zipData);
      for (const [path, entry] of Object.entries(zip.files) as [string, any][]) {
        if (!entry.dir) {
          const content = await entry.async('string');
          this.zipFiles.set(path, content);
        }
      }
      this.packageInfo = JSON.parse(this.zipFiles.get('device-info.json'));
      this.availableConnectivityTypes = this.packageInfo.connectivityTypes.filter(
        ct => this.packageInfo.installSteps[ct]?.length > 0
      );
      if (this.availableConnectivityTypes.length === 1) {
        this.selectedConnectivity = this.availableConnectivityTypes[0];
        this.showConnectivitySelector = false;
        this.startWizard();
      } else {
        this.showConnectivitySelector = true;
      }
    } catch (e) {
      console.error('Failed to parse device package ZIP', e);
    }
    this.loading = false;
    this.cdr.detectChanges();
  }

  // --- Connectivity ---

  selectConnectivity(ct: string): void {
    this.selectedConnectivity = ct;
  }

  confirmConnectivity(): void {
    if (!this.selectedConnectivity) {
      return;
    }
    this.startWizard();
  }

  // --- Wizard ---

  get isLastWizardStep(): boolean {
    return this.stepper && this.stepper.selectedIndex === this.wizardSteps.length - 1;
  }

  get currentWizardStep(): WizardStep | null {
    if (!this.stepper || !this.wizardSteps.length) {
      return null;
    }
    return this.wizardSteps[this.stepper.selectedIndex] ?? null;
  }

  nextStep(): void {
    const step = this.currentWizardStep;
    if (!step) {
      return;
    }
    if (step.type === 'form') {
      if (step.formGroup?.invalid) {
        step.formGroup.markAllAsTouched();
        return;
      }
      Object.assign(this.formValues, step.formGroup.getRawValue());
    }
    if (this.isLastWizardStep) {
      this.done();
      return;
    }
    step.completed = true;
    this.stepper.next();
    this.onStepActivated();
  }

  done(): void {
    this.dialogRef.close('installed');
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  retryEntitySteps(step: WizardStep): void {
    step.progressError = null;
    this.runEntitySteps(step);
  }

  goBackToForm(): void {
    // Find the last form step before the current progress step
    const currentIdx = this.stepper.selectedIndex;
    for (let i = currentIdx - 1; i >= 0; i--) {
      if (this.wizardSteps[i].type === 'form') {
        // Reset the progress step so it re-runs when we come back
        const progressStep = this.wizardSteps[currentIdx];
        progressStep.entitySteps = null;
        progressStep.progressError = null;
        progressStep.progressDone = false;
        progressStep.completed = false;
        // Allow navigation back by making intermediate steps editable
        for (let j = i; j < currentIdx; j++) {
          this.wizardSteps[j].completed = false;
        }
        this.stepper.selectedIndex = i;
        return;
      }
    }
  }

  getPatternErrorMessage(field: FormFieldDefinition): string {
    return field.validators?.[0]?.message || 'Invalid format';
  }

  // --- Variable Resolution ---

  resolveVariables(content: string): string {
    return content.replace(/\$\{([^}]+)\}/g, (_match, key) => {
      if (key in this.formValues) {
        return String(this.formValues[key]);
      }
      const dotIdx = key.indexOf('.');
      if (dotIdx > 0) {
        const alias = key.substring(0, dotIdx);
        const prop = key.substring(dotIdx + 1);
        const output = this.entityOutputs.get(alias);
        if (output && prop in output) {
          return String((output as any)[prop]);
        }
        const m = alias.match(/^step(\d+)$/);
        if (m) {
          const pos = this.positionalOutputs.get(parseInt(m[1], 10));
          if (pos && prop in pos) {
            return String((pos as any)[prop]);
          }
        }
      }
      return '${' + key + '}';
    });
  }

  // --- Private ---

  private startWizard(): void {
    this.formValues = {};
    this.entityOutputs.clear();
    this.positionalOutputs.clear();
    this.passwordVisible = {};
    this.buildWizardSteps();
    this.wizardStarted = true;

    // Activate the first step after the stepper renders
    setTimeout(() => this.onStepActivated(), 0);
  }

  private buildWizardSteps(): void {
    const rawSteps = this.packageInfo.installSteps[this.selectedConnectivity] || [];
    this.wizardSteps = [];
    let i = 0;
    while (i < rawSteps.length) {
      const step = rawSteps[i];
      if (step.type === InstallStepType.SHOW_INSTRUCTION) {
        this.wizardSteps.push({
          type: 'instruction',
          label: step.name,
          rawSteps: [step],
          completed: false
        });
        i++;
      } else if (step.type === InstallStepType.SHOW_FORM) {
        this.wizardSteps.push({
          type: 'form',
          label: step.name,
          rawSteps: [step],
          completed: false
        });
        i++;
      } else if (ENTITY_STEP_TYPES.has(step.type)) {
        // Group consecutive entity steps
        const group: DeviceInstallStep[] = [];
        while (i < rawSteps.length && ENTITY_STEP_TYPES.has(rawSteps[i].type)) {
          group.push(rawSteps[i]);
          i++;
        }
        this.wizardSteps.push({
          type: 'progress',
          label: 'Provisioning',
          rawSteps: group,
          completed: false
        });
      } else {
        // Skip unsupported steps (CONVERTER, INTEGRATION)
        i++;
      }
    }
    // Initialize form groups
    for (const ws of this.wizardSteps) {
      if (ws.type === 'form') {
        this.initFormStep(ws);
      }
    }
  }

  private initFormStep(ws: WizardStep): void {
    const formJson = this.zipFiles.get(ws.rawSteps[0].file) || '[]';
    ws.formFields = JSON.parse(formJson) as FormFieldDefinition[];
    const controls: Record<string, UntypedFormControl> = {};
    for (const field of ws.formFields) {
      const validators = [];
      if (field.required) {
        validators.push(Validators.required);
      }
      if (field.validators?.length > 0) {
        validators.push(Validators.pattern(field.validators[0].pattern));
      }
      const initialValue = field.defaultValue ?? (field.type === FormFieldType.BOOLEAN ? false : '');
      controls[field.key] = new UntypedFormControl(initialValue, validators);
      if (field.type === FormFieldType.PASSWORD) {
        this.passwordVisible[field.key] = false;
      }
    }
    ws.formGroup = new UntypedFormGroup(controls);
  }

  private onStepActivated(): void {
    const step = this.currentWizardStep;
    if (!step) {
      return;
    }
    if (step.type === 'instruction') {
      const raw = this.zipFiles.get(step.rawSteps[0].file) || '';
      step.markdown = this.resolveVariables(raw);
    } else if (step.type === 'progress' && !step.progressDone) {
      this.initAndRunEntitySteps(step);
    }
  }

  private initAndRunEntitySteps(ws: WizardStep): void {
    ws.entitySteps = ws.rawSteps.map(s => ({
      step: s,
      status: 'pending' as const,
      resolvedName: this.resolveVariables(s.name)
    }));
    ws.progressError = null;
    ws.progressDone = false;
    this.runEntitySteps(ws);
  }

  private async runEntitySteps(ws: WizardStep): Promise<void> {
    for (const ep of ws.entitySteps) {
      if (ep.status === 'success') {
        continue;
      }
      ep.status = 'running';
      ep.errorMessage = null;
      this.cdr.detectChanges();
      try {
        const startTime = Date.now();
        const output = await this.createEntity(ep.step);
        // Ensure minimum visible time per step
        const elapsed = Date.now() - startTime;
        if (elapsed < ENTITY_STEP_MIN_DELAY) {
          await this.delay(ENTITY_STEP_MIN_DELAY - elapsed);
        }
        ep.entityOutput = output;
        ep.status = 'success';

        const alias = stepTypeAliasMap[ep.step.type];
        if (alias) {
          this.entityOutputs.set(alias, output);
        }
        const rawSteps = this.packageInfo.installSteps[this.selectedConnectivity] || [];
        const stepIdx = rawSteps.indexOf(ep.step);
        if (stepIdx >= 0) {
          this.positionalOutputs.set(stepIdx + 1, output);
        }

        // Re-resolve names of remaining pending steps
        for (const remaining of ws.entitySteps) {
          if (remaining.status === 'pending') {
            remaining.resolvedName = this.resolveVariables(remaining.step.name);
          }
        }
        this.cdr.detectChanges();
      } catch (err: any) {
        ep.status = 'error';
        ep.errorMessage = err?.error?.message || err?.message || 'Unknown error';
        ws.progressError = ep.errorMessage;
        this.cdr.detectChanges();
        return;
      }
    }

    // All done — register install with created entity IDs
    ws.progressDone = true;
    ws.completed = true;
    try {
      const createdEntityIds = this.collectCreatedEntityIds();
      const dashboardId = this.findCreatedDashboardId();
      await firstValueFrom(
        this.data.iotHubApiService.registerDeviceInstall(
          this.data.item.id as string,
          { createdEntityIds, dashboardId },
          { ignoreLoading: true }
        )
      );
    } catch (_e) {
      // Non-critical — entities are created, tracking registration failed
      console.error('Failed to register device install', _e);
    }

    // Auto-advance to next step after a short pause
    if (!this.isLastWizardStep) {
      await this.delay(500);
      this.stepper.next();
      this.cdr.detectChanges();
      this.onStepActivated();
    }
  }

  private async createEntity(step: DeviceInstallStep): Promise<EntityStepOutput> {
    const raw = this.zipFiles.get(step.template);
    if (!raw) {
      throw new Error(`Template file not found: ${step.template}`);
    }
    const resolved = this.resolveVariables(raw);
    const template = JSON.parse(resolved);

    switch (step.type) {
      case InstallStepType.DEVICE_PROFILE: {
        const existing = await this.findDeviceProfileByName(template.name);
        if (existing) {
          return existing;
        }
        const result = await firstValueFrom(this.deviceProfileService.saveDeviceProfile(template, {ignoreErrors: true}));
        return { id: result.id.id, name: result.name };
      }
      case InstallStepType.DEVICE: {
        const result = await firstValueFrom(this.deviceService.saveDevice(template, {ignoreErrors: true}));
        const creds = await firstValueFrom(this.deviceService.getDeviceCredentials(result.id.id, false, {ignoreErrors: true}));
        return { id: result.id.id, name: result.name, token: creds.credentialsId };
      }
      case InstallStepType.DASHBOARD: {
        const result = await firstValueFrom(this.dashboardService.saveDashboard(template, {ignoreErrors: true}));
        return { id: result.id.id, name: result.title };
      }
      case InstallStepType.RULE_CHAIN: {
        const ruleChain = template.ruleChain || template;
        const metadata = template.metadata;
        const existing = await this.findRuleChainByName(ruleChain.name);
        if (existing) {
          return existing;
        }
        const saved = await firstValueFrom(this.ruleChainService.saveRuleChain(ruleChain, {ignoreErrors: true}));
        if (metadata) {
          metadata.ruleChainId = saved.id;
          await firstValueFrom(this.ruleChainService.saveRuleChainMetadata(metadata, {ignoreErrors: true}));
        }
        return { id: saved.id.id, name: saved.name };
      }
      default:
        throw new Error(`Unsupported entity step type: ${step.type}`);
    }
  }

  private async findDeviceProfileByName(name: string): Promise<EntityStepOutput | null> {
    const profiles = await firstValueFrom(this.deviceProfileService.getDeviceProfileNames());
    const match = profiles.find(p => p.name === name);
    return match ? { id: match.id.id, name: match.name } : null;
  }

  private async findRuleChainByName(name: string): Promise<EntityStepOutput | null> {
    const page = await firstValueFrom(this.ruleChainService.getRuleChains(new PageLink(100, 0, name)));
    const match = page.data.find(rc => rc.name === name);
    return match ? { id: match.id.id, name: match.name } : null;
  }

  private collectCreatedEntityIds(): { entityType: string; id: string }[] {
    const ids: { entityType: string; id: string }[] = [];
    for (const ws of this.wizardSteps) {
      if (ws.type === 'progress' && ws.entitySteps) {
        for (const ep of ws.entitySteps) {
          if (ep.status === 'success' && ep.entityOutput) {
            const entityType = this.stepTypeToEntityType(ep.step.type);
            if (entityType) {
              ids.push({ entityType, id: ep.entityOutput.id });
            }
          }
        }
      }
    }
    return ids;
  }

  private findCreatedDashboardId(): { entityType: string; id: string } | undefined {
    for (const ws of this.wizardSteps) {
      if (ws.type === 'progress' && ws.entitySteps) {
        for (const ep of ws.entitySteps) {
          if (ep.step.type === InstallStepType.DASHBOARD && ep.status === 'success' && ep.entityOutput) {
            return { entityType: 'DASHBOARD', id: ep.entityOutput.id };
          }
        }
      }
    }
    return undefined;
  }

  private stepTypeToEntityType(stepType: InstallStepType): string | null {
    switch (stepType) {
      case InstallStepType.DEVICE_PROFILE: return 'DEVICE_PROFILE';
      case InstallStepType.DEVICE: return 'DEVICE';
      case InstallStepType.DASHBOARD: return 'DASHBOARD';
      case InstallStepType.RULE_CHAIN: return 'RULE_CHAIN';
      default: return null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
