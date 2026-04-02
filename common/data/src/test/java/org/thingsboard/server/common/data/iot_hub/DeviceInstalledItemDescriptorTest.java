/**
 * Copyright © 2016-2026 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.thingsboard.server.common.data.iot_hub;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.thingsboard.server.common.data.EntityType;
import org.thingsboard.server.common.data.id.DashboardId;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class DeviceInstalledItemDescriptorTest {

    private static final ObjectMapper mapper = new ObjectMapper();

    @Test
    void deserializeFromFrontendPayload() throws Exception {
        // Exact payload the frontend sends after the fix
        String json = """
                {
                  "type": "DEVICE",
                  "createdEntityIds": [
                    {"entityType": "DEVICE_PROFILE", "id": "3eb9c330-2e57-11f1-9334-a385172e8e7d"},
                    {"entityType": "DEVICE", "id": "8a90d5e0-2e5d-11f1-a802-c35a9af2ebde"},
                    {"entityType": "DASHBOARD", "id": "8bc229f0-2e5d-11f1-a802-c35a9af2ebde"}
                  ],
                  "dashboardId": {"entityType": "DASHBOARD", "id": "8bc229f0-2e5d-11f1-a802-c35a9af2ebde"}
                }
                """;

        // Deserialize the same way the controller does (JsonNode → treeToValue)
        JsonNode node = mapper.readTree(json);
        DeviceInstalledItemDescriptor descriptor = mapper.treeToValue(node, DeviceInstalledItemDescriptor.class);

        assertThat(descriptor).isNotNull();
        assertThat(descriptor.getCreatedEntityIds()).hasSize(3);
        assertThat(descriptor.getCreatedEntityIds().get(0).getEntityType()).isEqualTo(EntityType.DEVICE_PROFILE);
        assertThat(descriptor.getCreatedEntityIds().get(1).getEntityType()).isEqualTo(EntityType.DEVICE);
        assertThat(descriptor.getCreatedEntityIds().get(2).getEntityType()).isEqualTo(EntityType.DASHBOARD);
        assertThat(descriptor.getDashboardId()).isNotNull();
        assertThat(descriptor.getDashboardId().getId()).isEqualTo(UUID.fromString("8bc229f0-2e5d-11f1-a802-c35a9af2ebde"));
    }

    @Test
    void roundTripSerialization() throws Exception {
        DeviceInstalledItemDescriptor original = new DeviceInstalledItemDescriptor();
        DashboardId dashboardId = new DashboardId(UUID.randomUUID());
        original.setDashboardId(dashboardId);
        original.setCreatedEntityIds(java.util.List.of(dashboardId));

        String json = mapper.writeValueAsString(original);
        JsonNode node = mapper.readTree(json);
        DeviceInstalledItemDescriptor deserialized = mapper.treeToValue(node, DeviceInstalledItemDescriptor.class);

        assertThat(deserialized.getDashboardId().getId()).isEqualTo(original.getDashboardId().getId());
        assertThat(deserialized.getCreatedEntityIds()).hasSize(1);
        assertThat(deserialized.getCreatedEntityIds().get(0).getId()).isEqualTo(dashboardId.getId());
    }
}
