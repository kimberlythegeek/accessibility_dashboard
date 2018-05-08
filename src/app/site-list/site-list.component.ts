import { Component, OnInit } from '@angular/core';
import { Site } from '../models/site.model';
import { SiteDataService } from '../site-data.service';

@Component({
  selector: 'app-site-list',
  templateUrl: './site-list.component.html',
  styleUrls: ['./site-list.component.css']
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
      .then(response => {
        this.siteList = response;
      })
      .then(_ => {
        let sites = [];
        this.siteList.forEach(element => {
          this.siteDataService.getSiteData(element['name'])
            .subscribe((results) => {
              let current = results[0]
              current['last_updated'] = this.convertDate(current['last_updated']);
              let data = current;
              let site = new Site(element['name'], element['url'], data);
              sites.push(site);
            });
        })
        this.sites = sites;
      });
  }

  convertDate(pythonDate){
    return new Date(pythonDate * 1000);
  }

}
