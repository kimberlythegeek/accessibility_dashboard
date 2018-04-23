import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';

@Injectable()
export class SiteDataService {

  siteListURL = '../assets/sites.json';
  siteDataURL = 'http://138.68.58.251:5000/';

  constructor(private httpClient: HttpClient) { }

  public async getSiteList(): Promise<any> {
    let response = await this.httpClient.get(this.siteListURL).toPromise();
    return response;
  }

  public getSiteData(siteName): Observable<any> {
    return this.httpClient.get(this.siteDataURL + siteName);
  }

}
