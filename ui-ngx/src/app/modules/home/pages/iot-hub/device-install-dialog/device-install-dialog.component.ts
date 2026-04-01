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

import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
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

export type DeviceInstallView = 'connectivity' | 'instruction' | 'form' | 'progress' | 'done';

export interface DeviceInstallDialogData {
  item: MpItemVersionView;
  zipData: ArrayBuffer;
  iotHubApiService: IotHubApiService;
}

@Component({
  selector: 'tb-device-install-dialog',
  standalone: false,
  templateUrl: './device-install-dialog.component.html',
  styleUrls: ['./device-install-dialog.component.scss']
})
export class TbDeviceInstallDialogComponent implements OnInit {

  loading = true;
  packageInfo: DevicePackageInfo;
  zipFiles = new Map<string, string>();

  availableConnectivityTypes: string[] = [];
  selectedConnectivity: string | null = null;

  currentView: DeviceInstallView = 'connectivity';
  steps: DeviceInstallStep[] = [];
  currentStepIndex = 0;

  currentMarkdown = '';
  currentFormFields: FormFieldDefinition[] = [];
  currentFormGroup: UntypedFormGroup | null = null;
  passwordVisible: Record<string, boolean> = {};

  formValues: Record<string, any> = {};
  entityOutputs = new Map<string, EntityStepOutput>();
  positionalOutputs = new Map<number, EntityStepOutput>();

  entitySteps: EntityStepProgress[] = [];
  progressError: string | null = null;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: DeviceInstallDialogData,
    private dialogRef: MatDialogRef<TbDeviceInstallDialogComponent>,
    private deviceProfileService: DeviceProfileService,
    private deviceService: DeviceService,
    private dashboardService: DashboardService,
    private ruleChainService: RuleChainService
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(this.data.zipData);
      for (const [path, entry] of Object.entries(zip.files)) {
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
        this.steps = this.packageInfo.installSteps[this.selectedConnectivity] || [];
        this.currentStepIndex = 0;
        this.advanceToCurrentStep();
      }
    } catch (e) {
      console.error('Failed to parse device package ZIP', e);
    }
    this.loading = false;
  }

  getConnectivityLabel(ct: string): string {
    return connectivityTypeTranslations.get(ct) || ct;
  }

  selectConnectivity(ct: string): void {
    this.selectedConnectivity = ct;
  }

  next(): void {
    if (this.currentView === 'connectivity') {
      if (!this.selectedConnectivity) {
        return;
      }
      this.steps = this.packageInfo.installSteps[this.selectedConnectivity] || [];
      this.currentStepIndex = 0;
      this.formValues = {};
      this.entityOutputs.clear();
      this.positionalOutputs.clear();
      this.advanceToCurrentStep();
      return;
    }

    if (this.currentView === 'form') {
      if (this.currentFormGroup && this.currentFormGroup.invalid) {
        this.currentFormGroup.markAllAsTouched();
        return;
      }
      if (this.currentFormGroup) {
        Object.assign(this.formValues, this.currentFormGroup.value);
      }
    }

    if (this.currentView === 'instruction' && this.isLastStep()) {
      this.done();
      return;
    }

    this.currentStepIndex++;
    this.advanceToCurrentStep();
  }

  advanceToCurrentStep(): void {
    if (this.currentStepIndex >= this.steps.length) {
      this.currentView = 'done';
      this.currentMarkdown = '';
      return;
    }

    const step = this.steps[this.currentStepIndex];

    switch (step.type) {
      case InstallStepType.SHOW_INSTRUCTION: {
        this.currentView = 'instruction';
        const raw = this.zipFiles.get(step.file) || '';
        this.currentMarkdown = this.resolveVariables(raw);
        break;
      }
      case InstallStepType.SHOW_FORM: {
        this.currentView = 'form';
        const formJson = this.zipFiles.get(step.file) || '[]';
        this.currentFormFields = JSON.parse(formJson) as FormFieldDefinition[];
        this.buildFormGroup();
        break;
      }
      default: {
        if (ENTITY_STEP_TYPES.has(step.type)) {
          this.collectAndRunEntitySteps();
        } else {
          // Skip unsupported step types (CONVERTER, INTEGRATION)
          this.currentStepIndex++;
          this.advanceToCurrentStep();
        }
        break;
      }
    }
  }

  isLastStep(): boolean {
    return this.currentStepIndex >= this.steps.length - 1;
  }

  done(): void {
    this.dialogRef.close('installed');
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  retryEntitySteps(): void {
    this.progressError = null;
    this.runEntitySteps();
  }

  getPatternErrorMessage(field: FormFieldDefinition): string {
    if (field.validators?.length > 0) {
      return field.validators[0].message || 'Invalid format';
    }
    return 'Invalid format';
  }

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
          return String(output[prop]);
        }
        const m = alias.match(/^step(\d+)$/);
        if (m) {
          const pos = this.positionalOutputs.get(parseInt(m[1], 10));
          if (pos && prop in pos) {
            return String(pos[prop]);
          }
        }
      }
      return '${' + key + '}';
    });
  }

  private buildFormGroup(): void {
    const controls: Record<string, UntypedFormControl> = {};
    this.passwordVisible = {};
    for (const field of this.currentFormFields) {
      const validators = [];
      if (field.required) {
        validators.push(Validators.required);
      }
      if (field.validators?.length > 0) {
        validators.push(Validators.pattern(field.validators[0].pattern));
      }
      const initialValue = field.key in this.formValues
        ? this.formValues[field.key]
        : (field.defaultValue ?? (field.type === FormFieldType.BOOLEAN ? false : ''));
      controls[field.key] = new UntypedFormControl(initialValue, validators);
      if (field.type === FormFieldType.PASSWORD) {
        this.passwordVisible[field.key] = false;
      }
    }
    this.currentFormGroup = new UntypedFormGroup(controls);
  }

  private collectAndRunEntitySteps(): void {
    this.entitySteps = [];
    let i = this.currentStepIndex;
    while (i < this.steps.length && ENTITY_STEP_TYPES.has(this.steps[i].type)) {
      this.entitySteps.push({
        step: this.steps[i],
        status: 'pending',
        resolvedName: this.resolveVariables(this.steps[i].name)
      });
      i++;
    }
    this.currentView = 'progress';
    this.progressError = null;
    this.runEntitySteps();
  }

  private async runEntitySteps(): Promise<void> {
    for (const ep of this.entitySteps) {
      if (ep.status === 'success') {
        continue;
      }
      ep.status = 'running';
      ep.errorMessage = null;
      try {
        const output = await this.createEntity(ep.step);
        ep.entityOutput = output;
        ep.status = 'success';

        const alias = stepTypeAliasMap[ep.step.type];
        if (alias) {
          this.entityOutputs.set(alias, output);
        }
        const stepIdx = this.steps.indexOf(ep.step);
        if (stepIdx >= 0) {
          this.positionalOutputs.set(stepIdx + 1, output);
        }

        // Re-resolve names of remaining pending steps
        for (const remaining of this.entitySteps) {
          if (remaining.status === 'pending') {
            remaining.resolvedName = this.resolveVariables(remaining.step.name);
          }
        }
      } catch (err: any) {
        ep.status = 'error';
        ep.errorMessage = err?.error?.message || err?.message || 'Unknown error';
        this.progressError = ep.errorMessage;
        return;
      }
    }

    // All entity steps succeeded — advance past them
    const lastEntityIdx = this.currentStepIndex + this.entitySteps.length - 1;
    this.currentStepIndex = lastEntityIdx + 1;

    // Report install
    try {
      await firstValueFrom(
        this.data.iotHubApiService.reportVersionInstalled(this.data.item.id as string, { ignoreLoading: true })
      );
    } catch (_e) {
      // Non-critical — best effort
    }

    // Advance to next step (instruction after entities, or done)
    this.advanceToCurrentStep();
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
        const result = await firstValueFrom(this.deviceProfileService.saveDeviceProfile(template));
        return { id: result.id.id, name: result.name };
      }
      case InstallStepType.DEVICE: {
        const result = await firstValueFrom(this.deviceService.saveDevice(template));
        const creds = await firstValueFrom(this.deviceService.getDeviceCredentials(result.id.id));
        return { id: result.id.id, name: result.name, token: creds.credentialsId };
      }
      case InstallStepType.DASHBOARD: {
        const result = await firstValueFrom(this.dashboardService.saveDashboard(template));
        return { id: result.id.id, name: result.title };
      }
      case InstallStepType.RULE_CHAIN: {
        const ruleChain = template.ruleChain || template;
        const metadata = template.metadata;
        const saved = await firstValueFrom(this.ruleChainService.saveRuleChain(ruleChain));
        if (metadata) {
          metadata.ruleChainId = saved.id;
          await firstValueFrom(this.ruleChainService.saveRuleChainMetadata(metadata));
        }
        return { id: saved.id.id, name: saved.name };
      }
      default:
        throw new Error(`Unsupported entity step type: ${step.type}`);
    }
  }
}
