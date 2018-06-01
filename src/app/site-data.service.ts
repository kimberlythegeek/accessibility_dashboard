import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { Site } from './models/site.model';

@Injectable()
export class SiteDataService {
  protected _siteData: Site[];

  siteListURL = '../assets/sites.json';
  siteDataURL = 'https://webaccessibility.rocks/';

  constructor(private http: HttpClient) { }

  public async getSiteList(): Promise<any> {
    const response = await this.http.get(this.siteListURL).toPromise();
    return response;
  }

  public getSiteData(siteList): Observable<any> {
    const sites = [];
    return new Observable(observer => {
      if (this._siteData) {
        observer.next(this._siteData);
        return observer.complete();
      }
      siteList.forEach(element => {
        this.http
          .get(this.siteDataURL + element['name'])
          .subscribe((results: Array<any>) => {
            const current = results[results.length - 1];
            current['last_updated'] = this.convertDate(current['last_updated']);
            const data = current;
            const site = new Site(element['name'], element['url'], data, results);
            sites.push(site);
          });
        });
        this._siteData = sites;
        observer.next(this._siteData);
        observer.complete();
    });
  }

  convertDate(pythonDate) {
    return new Date(pythonDate * 1000);
  }

}
