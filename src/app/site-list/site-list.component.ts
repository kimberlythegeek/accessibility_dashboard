import { Component, OnInit } from '@angular/core';
import { Site } from '../models/site.model';
import { SiteDataService } from '../site-data.service';

@Component({
  selector: 'app-site-list',
  templateUrl: './site-list.component.html'
})

export class SiteListComponent implements OnInit {
  siteList: Object[];
  sites: Site[];
  selectedSite: Site;

  constructor(private siteDataService: SiteDataService) {}

  ngOnInit() {
    this.getSiteData();
  }

  async getSiteData() {
    this.siteDataService.getSiteList()
      .then(siteList => {
        this.siteDataService.getSiteData(siteList)
        .subscribe(data => this.sites = data);
      });
  }

  convertDate(pythonDate) {
    return new Date(pythonDate * 1000);
  }

}
