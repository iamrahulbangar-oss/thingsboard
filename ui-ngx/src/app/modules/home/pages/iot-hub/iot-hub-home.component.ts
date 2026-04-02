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

import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { forkJoin } from 'rxjs';
import { PageLink } from '@shared/models/page/page-link';
import { Direction, SortOrder } from '@shared/models/page/sort-order';
import { MpItemVersionQuery, MpItemVersionView } from '@shared/models/iot-hub/iot-hub-version.models';
import { ItemType, itemTypeTranslations } from '@shared/models/iot-hub/iot-hub-item.models';
import { IotHubInstalledItem } from '@shared/models/iot-hub/iot-hub-installed-item.models';
import { IotHubApiService } from '@core/http/iot-hub-api.service';
import { TbIotHubItemDetailDialogComponent, IotHubItemDetailDialogData } from './iot-hub-item-detail-dialog.component';
import { TbIotHubInstallDialogComponent, IotHubInstallDialogData } from './iot-hub-install-dialog.component';
import { TbIotHubUpdateDialogComponent, IotHubUpdateDialogData } from './iot-hub-update-dialog.component';
import { TbIotHubDeleteDialogComponent, IotHubDeleteDialogData } from './iot-hub-delete-dialog.component';
import { TbDeviceInstallDialogComponent, DeviceInstallDialogData } from './device-install-dialog/device-install-dialog.component';

interface CategoryCard {
  type: ItemType;
  titleKey: string;
  icon: string;
  cssClass: string;
  image: string;
}

interface HeroTypeConfig {
  type: ItemType;
  labelKey: string;
  color: string;
  gradientColor: string;
  icons: string[];
}

@Component({
  selector: 'tb-iot-hub-home',
  standalone: false,
  templateUrl: './iot-hub-home.component.html',
  styleUrls: ['./iot-hub-home.component.scss']
})
export class TbIotHubHomeComponent implements OnInit, OnDestroy {

  readonly ItemType = ItemType;

  searchText = '';

  heroTypes: HeroTypeConfig[] = [
    {
      type: ItemType.WIDGET, labelKey: 'item.type-widget-plural', color: '#2c9755',
      gradientColor: 'rgba(44, 151, 85, 0.1)',
      icons: ['assets/iot-hub/hero-widget-icon-1.svg', 'assets/iot-hub/hero-widget-icon-2.svg', 'assets/iot-hub/hero-widget-icon-3.svg', 'assets/iot-hub/hero-widget-icon-4.svg']
    },
    {
      type: ItemType.DASHBOARD, labelKey: 'item.type-dashboard-plural', color: '#4d5fd0',
      gradientColor: 'rgba(77, 95, 208, 0.1)',
      icons: ['assets/iot-hub/hero-dashboard-icon-1.svg', 'assets/iot-hub/hero-dashboard-icon-2.svg', 'assets/iot-hub/hero-dashboard-icon-3.svg', 'assets/iot-hub/hero-dashboard-icon-4.svg']
    },
    {
      type: ItemType.SOLUTION_TEMPLATE, labelKey: 'item.type-solution-template-plural', color: '#2666a9',
      gradientColor: 'rgba(38, 102, 169, 0.1)',
      icons: ['assets/iot-hub/hero-solution-template-icon-1.svg', 'assets/iot-hub/hero-solution-template-icon-2.svg', 'assets/iot-hub/hero-solution-template-icon-3.svg', 'assets/iot-hub/hero-solution-template-icon-4.svg']
    },
    {
      type: ItemType.CALCULATED_FIELD, labelKey: 'item.type-calculated-field-plural', color: '#006d92',
      gradientColor: 'rgba(0, 109, 146, 0.1)',
      icons: ['assets/iot-hub/hero-calculated-field-icon-1.svg', 'assets/iot-hub/hero-calculated-field-icon-2.svg', 'assets/iot-hub/hero-calculated-field-icon-3.svg', 'assets/iot-hub/hero-calculated-field-icon-4.svg']
    },
    {
      type: ItemType.RULE_CHAIN, labelKey: 'item.type-rule-chain-plural', color: '#95694b',
      gradientColor: 'rgba(149, 105, 75, 0.1)',
      icons: ['assets/iot-hub/hero-rule-chain-icon-1.svg', 'assets/iot-hub/hero-rule-chain-icon-2.svg', 'assets/iot-hub/hero-rule-chain-icon-3.svg', 'assets/iot-hub/hero-rule-chain-icon-4.svg']
    },
    {
      type: ItemType.DEVICE, labelKey: 'iot-hub.and-devices', color: '#4b8a79',
      gradientColor: 'rgba(75, 138, 121, 0.1)',
      icons: ['assets/iot-hub/hero-device-icon-1.svg', 'assets/iot-hub/hero-device-icon-2.svg', 'assets/iot-hub/hero-device-icon-3.svg', 'assets/iot-hub/hero-device-icon-4.svg']
    }
  ];

  activeHeroType: HeroTypeConfig = this.heroTypes[0];
  heroIconsReady = false;
  private heroInterval: any;

  categoryCards: CategoryCard[] = [
    { type: ItemType.WIDGET, titleKey: 'item.type-widget-plural', icon: 'widgets', cssClass: 'category-widgets', image: 'assets/iot-hub/category-widgets-img.svg' },
    { type: ItemType.DASHBOARD, titleKey: 'item.type-dashboard-plural', icon: 'dashboard', cssClass: 'category-dashboards', image: 'assets/iot-hub/category-dashboards-img.svg' },
    { type: ItemType.SOLUTION_TEMPLATE, titleKey: 'item.type-solution-template-plural', icon: 'integration_instructions', cssClass: 'category-solutions', image: 'assets/iot-hub/category-solution-templates-img.png' },
    { type: ItemType.CALCULATED_FIELD, titleKey: 'item.type-calculated-field-plural', icon: 'functions', cssClass: 'category-calc-fields', image: 'assets/iot-hub/category-calculated-fields-img.svg' },
    { type: ItemType.RULE_CHAIN, titleKey: 'item.type-rule-chain-plural', icon: 'account_tree', cssClass: 'category-rule-chains', image: 'assets/iot-hub/category-rule-chains-img.svg' },
    { type: ItemType.DEVICE, titleKey: 'iot-hub.device-library', icon: 'memory', cssClass: 'category-devices', image: 'assets/iot-hub/category-device-library-img.svg' }
  ];

  popularWidgets: MpItemVersionView[] = [];
  popularDashboards: MpItemVersionView[] = [];
  popularSolutionTemplates: MpItemVersionView[] = [];
  popularCalcFields: MpItemVersionView[] = [];
  popularRuleChains: MpItemVersionView[] = [];

  installedWidgets: IotHubInstalledItem[] = [];
  installedSolutionTemplates: IotHubInstalledItem[] = [];
  installedItemsCount = 0;

  isLoading = true;

  constructor(
    private router: Router,
    private dialog: MatDialog,
    private iotHubApiService: IotHubApiService
  ) {}

  ngOnInit(): void {
    this.loadPopularItems();
    // One-tick delay so Angular renders icons in hidden state first, then triggers transition
    requestAnimationFrame(() => {
      this.heroIconsReady = true;
      this.startHeroCycle();
    });
  }

  ngOnDestroy(): void {
    this.stopHeroCycle();
  }

  onHeroTypeHover(config: HeroTypeConfig): void {
    this.stopHeroCycle();
    this.activeHeroType = config;
  }

  onHeroTypeLeave(): void {
    this.startHeroCycle();
  }

  private startHeroCycle(): void {
    this.stopHeroCycle();
    this.heroInterval = setInterval(() => {
      const idx = this.heroTypes.indexOf(this.activeHeroType);
      this.activeHeroType = this.heroTypes[(idx + 1) % this.heroTypes.length];
    }, 3000);
  }

  private stopHeroCycle(): void {
    if (this.heroInterval) {
      clearInterval(this.heroInterval);
      this.heroInterval = null;
    }
  }

  onSearch(): void {
    if (this.searchText?.trim()) {
      this.router.navigate(['/iot-hub', this.getTypeRoute(this.activeHeroType?.type || ItemType.WIDGET)],
        { queryParams: { search: this.searchText.trim() } });
    }
  }

  navigateToBrowse(type: ItemType): void {
    this.router.navigate(['/iot-hub', this.getTypeRoute(type)]);
  }

  private getTypeRoute(type: ItemType): string {
    switch (type) {
      case ItemType.WIDGET: return 'widgets';
      case ItemType.DASHBOARD: return 'dashboards';
      case ItemType.SOLUTION_TEMPLATE: return 'solution-templates';
      case ItemType.CALCULATED_FIELD: return 'calculated-fields';
      case ItemType.RULE_CHAIN: return 'rule-chains';
      case ItemType.DEVICE: return 'devices';
      default: return 'widgets';
    }
  }

  navigateToInstalledItems(): void {
    this.router.navigate(['/iot-hub/installed']);
  }

  openItemDetail(item: MpItemVersionView): void {
    const installedItem = this.findInstalledItem(item);
    const dialogRef = this.dialog.open(TbIotHubItemDetailDialogComponent, {
      panelClass: ['tb-dialog', 'tb-fullscreen-dialog'],
      autoFocus: false,
      data: {
        item,
        iotHubApiService: this.iotHubApiService,
        installedItem
      } as IotHubItemDetailDialogData
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result === 'installed' || result === 'deleted') {
        this.reloadInstalledItems(item.type);
      }
    });
  }

  private reloadInstalledItems(type: ItemType): void {
    const config = { ignoreLoading: true };
    const pageLink = new PageLink(10000, 0);
    this.iotHubApiService.getInstalledItemsCount(null, config).subscribe(count => {
      this.installedItemsCount = count;
    });
    if (type === ItemType.WIDGET) {
      this.iotHubApiService.getInstalledItems(pageLink, ItemType.WIDGET, config).subscribe(data => {
        this.installedWidgets = data.data;
      });
    } else if (type === ItemType.SOLUTION_TEMPLATE) {
      this.iotHubApiService.getInstalledItems(pageLink, ItemType.SOLUTION_TEMPLATE, config).subscribe(data => {
        this.installedSolutionTemplates = data.data;
      });
    }
  }

  private findInstalledItem(item: MpItemVersionView): IotHubInstalledItem | undefined {
    switch (item.type) {
      case ItemType.WIDGET:
        return this.installedWidgets.find(i => i.itemId === item.itemId);
      case ItemType.SOLUTION_TEMPLATE:
        return this.installedSolutionTemplates.find(i => i.itemId === item.itemId);
      default:
        return undefined;
    }
  }

  installItem(item: MpItemVersionView): void {
    if (item.type === ItemType.DEVICE) {
      this.installDevice(item);
      return;
    }
    const dialogRef = this.dialog.open(TbIotHubInstallDialogComponent, {
      panelClass: ['tb-dialog'],
      autoFocus: false,
      data: {
        item,
        iotHubApiService: this.iotHubApiService
      } as IotHubInstallDialogData
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result === 'installed') {
        this.reloadInstalledItems(item.type);
      }
    });
  }

  private installDevice(item: MpItemVersionView): void {
    this.iotHubApiService.getVersionFileData(item.id as string, { ignoreLoading: true }).subscribe({
      next: async (blob: Blob) => {
        const zipData = await blob.arrayBuffer();
        const dialogRef = this.dialog.open(TbDeviceInstallDialogComponent, {
          panelClass: ['tb-dialog', 'tb-fullscreen-dialog'],
          disableClose: true,
          autoFocus: false,
          data: { item, zipData, iotHubApiService: this.iotHubApiService } as DeviceInstallDialogData
        });
        dialogRef.afterClosed().subscribe(result => {
          if (result === 'installed') {
            this.reloadInstalledItems(item.type);
          }
        });
      }
    });
  }

  updateItem(item: MpItemVersionView): void {
    const installedItem = this.findInstalledItem(item);
    if (!installedItem) {
      return;
    }
    const dialogRef = this.dialog.open(TbIotHubUpdateDialogComponent, {
      panelClass: ['tb-dialog'],
      autoFocus: false,
      data: {
        installedItemId: installedItem.id.id,
        itemName: item.name,
        itemType: item.type,
        version: item.version,
        versionId: item.id,
        iotHubApiService: this.iotHubApiService
      } as IotHubUpdateDialogData
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result === 'updated') {
        this.reloadInstalledItems(item.type);
      }
    });
  }

  navigateToCreator(creatorId: string): void {
    this.router.navigate(['/iot-hub/creator', creatorId]);
  }

  getInstalledWidget(item: MpItemVersionView): IotHubInstalledItem | undefined {
    return this.installedWidgets.find(i => i.itemId === item.itemId);
  }

  getInstalledSolutionTemplate(item: MpItemVersionView): IotHubInstalledItem | undefined {
    return this.installedSolutionTemplates.find(i => i.itemId === item.itemId);
  }

  deleteInstalledItem(item: MpItemVersionView): void {
    const installedItem = this.findInstalledItem(item);
    if (!installedItem) {
      return;
    }
    const dialogRef = this.dialog.open(TbIotHubDeleteDialogComponent, {
      panelClass: ['tb-dialog'],
      autoFocus: false,
      data: { itemName: item.name } as IotHubDeleteDialogData
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.iotHubApiService.deleteInstalledItem(installedItem.id.id).subscribe(() => {
          this.installedItemsCount = Math.max(0, this.installedItemsCount - 1);
          if (item.type === ItemType.WIDGET) {
            this.installedWidgets = this.installedWidgets.filter(i => i.id.id !== installedItem.id.id);
          } else if (item.type === ItemType.SOLUTION_TEMPLATE) {
            this.installedSolutionTemplates = this.installedSolutionTemplates.filter(i => i.id.id !== installedItem.id.id);
          }
        });
      }
    });
  }

  openSignup(): void {
    window.open('https://iothub.thingsboard.io/signup', '_blank');
  }

  private loadPopularItems(): void {
    const sortOrder: SortOrder = { property: 'totalInstallCount', direction: Direction.DESC };
    const config = { ignoreLoading: true };
    const installedPageLink = new PageLink(10000, 0);

    const buildQuery = (type: ItemType, size: number): MpItemVersionQuery => {
      const pageLink = new PageLink(size, 0, null, sortOrder);
      return new MpItemVersionQuery(pageLink, type);
    };

    forkJoin({
      widgets: this.iotHubApiService.getPublishedVersions(buildQuery(ItemType.WIDGET, 5), config),
      dashboards: this.iotHubApiService.getPublishedVersions(buildQuery(ItemType.DASHBOARD, 5), config),
      solutionTemplates: this.iotHubApiService.getPublishedVersions(buildQuery(ItemType.SOLUTION_TEMPLATE, 5), config),
      calcFields: this.iotHubApiService.getPublishedVersions(buildQuery(ItemType.CALCULATED_FIELD, 6), config),
      ruleChains: this.iotHubApiService.getPublishedVersions(buildQuery(ItemType.RULE_CHAIN, 6), config),
      installedWidgets: this.iotHubApiService.getInstalledItems(installedPageLink, ItemType.WIDGET, config),
      installedSolutionTemplates: this.iotHubApiService.getInstalledItems(installedPageLink, ItemType.SOLUTION_TEMPLATE, config),
      installedCount: this.iotHubApiService.getInstalledItemsCount(null, config)
    }).subscribe({
      next: (results) => {
        this.popularWidgets = results.widgets.data;
        this.popularDashboards = results.dashboards.data;
        this.popularSolutionTemplates = results.solutionTemplates.data;
        this.popularCalcFields = results.calcFields.data;
        this.popularRuleChains = results.ruleChains.data;
        this.installedWidgets = results.installedWidgets.data;
        this.installedSolutionTemplates = results.installedSolutionTemplates.data;
        this.installedItemsCount = results.installedCount;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }
}
