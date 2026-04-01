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

export enum ConnectivityType {
  DIRECT_HTTP = 'DIRECT_HTTP',
  DIRECT_MQTT = 'DIRECT_MQTT',
  DIRECT_COAP = 'DIRECT_COAP',
  DIRECT_LWM2M = 'DIRECT_LWM2M',
  DIRECT_SNMP = 'DIRECT_SNMP',
  GATEWAY_MQTT = 'GATEWAY_MQTT',
  GATEWAY_MODBUS = 'GATEWAY_MODBUS',
  GATEWAY_OPCUA = 'GATEWAY_OPCUA',
  CHIRPSTACK = 'CHIRPSTACK',
  INTEGRATION_CHIRPSTACK = 'INTEGRATION_CHIRPSTACK',
  INTEGRATION_TTN = 'INTEGRATION_TTN',
  INTEGRATION_LORIOT = 'INTEGRATION_LORIOT'
}

export const connectivityTypeTranslations = new Map<string, string>(
  [
    [ConnectivityType.DIRECT_HTTP, 'HTTP'],
    [ConnectivityType.DIRECT_MQTT, 'MQTT'],
    [ConnectivityType.DIRECT_COAP, 'CoAP'],
    [ConnectivityType.DIRECT_LWM2M, 'LwM2M'],
    [ConnectivityType.DIRECT_SNMP, 'SNMP'],
    [ConnectivityType.GATEWAY_MQTT, 'MQTT Gateway'],
    [ConnectivityType.GATEWAY_MODBUS, 'Modbus Gateway'],
    [ConnectivityType.GATEWAY_OPCUA, 'OPC-UA Gateway'],
    [ConnectivityType.CHIRPSTACK, 'ChirpStack'],
    [ConnectivityType.INTEGRATION_CHIRPSTACK, 'ChirpStack (PE)'],
    [ConnectivityType.INTEGRATION_TTN, 'The Things Stack'],
    [ConnectivityType.INTEGRATION_LORIOT, 'LORIOT']
  ]
);

export enum InstallStepType {
  SHOW_INSTRUCTION = 'SHOW_INSTRUCTION',
  SHOW_FORM = 'SHOW_FORM',
  DEVICE_PROFILE = 'DEVICE_PROFILE',
  CONVERTER = 'CONVERTER',
  INTEGRATION = 'INTEGRATION',
  DEVICE = 'DEVICE',
  DASHBOARD = 'DASHBOARD',
  RULE_CHAIN = 'RULE_CHAIN'
}

export const ENTITY_STEP_TYPES: Set<string> = new Set([
  InstallStepType.DEVICE_PROFILE,
  InstallStepType.DEVICE,
  InstallStepType.DASHBOARD,
  InstallStepType.RULE_CHAIN
]);

export const stepTypeAliasMap: Record<string, string> = {
  [InstallStepType.DEVICE_PROFILE]: 'deviceProfile',
  [InstallStepType.DEVICE]: 'device',
  [InstallStepType.DASHBOARD]: 'dashboard',
  [InstallStepType.RULE_CHAIN]: 'ruleChain'
};

export interface DeviceInstallStep {
  type: InstallStepType;
  name: string;
  file?: string;
  template?: string;
}

export interface DevicePackageInfo {
  name: string;
  description: string;
  vendor: string;
  hardwareType: string;
  connectivityTypes: string[];
  installSteps: Record<string, DeviceInstallStep[]>;
}

export enum FormFieldType {
  STRING = 'STRING',
  INTEGER = 'INTEGER',
  BOOLEAN = 'BOOLEAN',
  SELECT = 'SELECT',
  PASSWORD = 'PASSWORD'
}

export interface FormFieldValidator {
  pattern: string;
  message: string;
}

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldDefinition {
  key: string;
  label: string;
  type: FormFieldType;
  defaultValue?: any;
  required?: boolean;
  helpText?: string;
  helpImage?: string;
  validators?: FormFieldValidator[];
  options?: FormFieldOption[];
}

export interface EntityStepOutput {
  id: string;
  name: string;
  token?: string;
}

export type EntityStepStatus = 'pending' | 'running' | 'success' | 'error';

export interface EntityStepProgress {
  step: DeviceInstallStep;
  status: EntityStepStatus;
  resolvedName?: string;
  entityOutput?: EntityStepOutput;
  errorMessage?: string;
}
