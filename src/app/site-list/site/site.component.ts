import { Component, Input, AfterViewInit } from '@angular/core';
import { Site } from '../../models/site.model';

@Component({
  selector: 'app-site',
  templateUrl: './site.component.html'
})
export class SiteComponent implements AfterViewInit {

  public show: Boolean;

  @Input() site: Site;

  history: Object[];

  ngAfterViewInit() {
  }


  constructor() { }

  siteStatus(site): string {
    const violations = site.data.violations;
    if (violations.length === 0) { return 'badge-info'; }
    const counter = {
      'critical': 0,
      'serious': 0,
      'moderate': 0,
      'minor': 0
    };
    violations.forEach(violation => {
      const impact = violation['impact'];
      counter[impact] += 1;
    });
    let score = 15 * counter['critical'] +
                9 * counter['serious'] +
                5 * counter['moderate'] +
                1 * counter['minor'];
    score = (score >= 100) ? 100 : score;
    if (score >= 60) {
      return 'moz-danger';
    } else if (score < 60 && score >= 20) {
      return 'moz-warning';
    } else { return 'moz-success'; }
  }

  convertDate(pythonDate) {
    return new Date(pythonDate * 1000);
  }
}
