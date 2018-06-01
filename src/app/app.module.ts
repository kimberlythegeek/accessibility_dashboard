import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { TimeAgoPipe } from 'time-ago-pipe';

import { AppComponent } from './app.component';
import { SiteListComponent } from './site-list/site-list.component';
import { SiteComponent } from './site-list/site/site.component';
import { SiteDataService } from './site-data.service';
import { ViolationComponent } from './site-list/site/violation/violation.component';
import { GraphComponent } from './site-list/graph/graph.component';
import { HeaderComponent } from './header/header.component';
import { NodeComponent } from './site-list/site/violation/node/node.component';

@NgModule({
  declarations: [
    AppComponent,
    SiteListComponent,
    SiteComponent,
    ViolationComponent,
    TimeAgoPipe,
    GraphComponent,
    HeaderComponent,
    NodeComponent
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
