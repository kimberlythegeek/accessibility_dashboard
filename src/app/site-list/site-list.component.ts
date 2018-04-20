import { Component, OnInit } from '@angular/core';
import { Site } from '../assets/site.model';
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

  constructor(private siteDataService: SiteDataService) {

  }

  ngOnInit() {
    this.getSiteData();
  }
  
  getSiteList(): void {

  }

  async getSiteData() {
    this.siteDataService.getSiteList()
      .then(response => {
        this.siteList = response;
      })
      .then(_ => {
        let sites = [];
        this.siteList.forEach(element => {
          console.log(element);
          this.siteDataService.getSiteData(element['name'])
            .subscribe((results) => {
              let data = results;
              console.log(results);
              let site = new Site(element['name'], element['url'], data);
              sites.push(site);
            });
        })
        this.sites = sites;
      });

    console.log(this.sites);
  }

  onSelect(site: Site): void {
    this.selectedSite = site;
  }

}
