import { Component, Input, AfterViewInit } from '@angular/core';
import { chart } from 'highcharts';
import * as Highcharts from 'highcharts';
import { Site } from '../../models/site.model';

@Component({
  selector: 'app-graph',
  templateUrl: './graph.component.html',
  styleUrls: ['./graph.component.css']
})
export class GraphComponent implements AfterViewInit {

  @Input() sites: Site[];

  convertDate(pythonDate) {
    const date = new Date(pythonDate * 1000);
    return (date.getMonth() + 1) + '-' + date.getDate();
  }

  constructor() { }

  ngAfterViewInit() {
    let xAxes = [];
    const series = [];
    this.sites.forEach(site => {
      const violations = [];
      const dates = [];
      site['history'].forEach(element => {
        violations.push(element['violations'].length);

        dates.push(this.convertDate(element['last_updated']));
      });
      xAxes = dates;
      series.push({
        name: site['name'],
        data: violations
      });
    });
    Highcharts.chart('graph', {
      title: {
        text: 'Mozilla\'s Web Accessibility Status'
      },
      xAxis : {
        categories: xAxes,
        title: {
          text: 'Accessibility Violations over Time'
        }
      },
      series: series
    });
  }

}
