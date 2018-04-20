import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';


import { AppComponent } from './app.component';
import { SiteListComponent } from './site-list/site-list.component';
import { SiteComponent } from './site-list/site/site.component';
import { SiteDetailComponent } from './site-list/site/site-detail/site-detail.component';
import { SiteDataService } from './site-data.service';


@NgModule({
  declarations: [
    AppComponent,
    SiteListComponent,
    SiteComponent,
    SiteDetailComponent,
  ],
  imports: [
    BrowserModule,
    HttpClientModule
  ],
  providers: [
    SiteDataService
  ],
  bootstrap: [
    AppComponent
  ]
})
export class AppModule { }
