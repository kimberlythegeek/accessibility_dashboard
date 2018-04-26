import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';

@Injectable()
export class SiteDataService {

  siteListURL = '../assets/sites.json';
  siteDataURL = 'https://webaccessibility.rocks/';

  constructor(private httpClient: HttpClient) { }

  public async getSiteList(): Promise<any> {
    let response = await this.httpClient.get(this.siteListURL).toPromise();
    return response;
  }

  public getSiteData(siteName): Observable<any> {
    return this.httpClient.get(this.siteDataURL + siteName);
  }

}
