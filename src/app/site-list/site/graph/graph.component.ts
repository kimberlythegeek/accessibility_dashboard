import { Component, Input, OnInit } from '@angular/core';
import { chart } from 'highcharts';
import * as Highcharts from 'highcharts';

@Component({
  selector: 'app-graph',
  templateUrl: './graph.component.html',
  styleUrls: ['./graph.component.css']
})
export class GraphComponent implements OnInit {

  @Input() history: Object[];

  chart: Highcharts.ChartObject;

  convertDate(pythonDate){
    return new Date(pythonDate * 1000);
  }

  constructor() { }

  ngOnInit() {
    let xAxes = [];
    let yAxes = [];
    let series = [];
    this.history.forEach(element => {
      let date = this.convertDate(element['last_updated']);
      let violations = element['violations'].length;
      xAxes.push(date);
      yAxes.push(violations);
      series.push([date, violations]);
    });

    
    const options: Highcharts.Options = {
      chart: {
        type: 'line'
      },
      title: {
        text: 'Accessibility Violations Over Time'
      },
      xAxis: {
        categories: xAxes
      },
      yAxis: {
        title: {
          text: 'Number of Violations'
        }
      },
      series: series
    };
    this.chart = chart('graph', options);
  }

}
