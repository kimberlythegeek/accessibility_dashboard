import { Component, Input } from '@angular/core';
import { Site } from '../../models/site.model';

@Component({
  selector: 'app-site',
  templateUrl: './site.component.html',
  styleUrls: ['./site.component.css']
})
export class SiteComponent {

  @Input() site: Site;

  public show: boolean = false;

  constructor() { }

  siteStatus(site): string {
    let violations = site.data.violations;
    if (violations.length == 0) { return 'badge-info'; }
    let counter = {
      'critical': 0,
      'serious': 0,
      'moderate': 0,
      'minor': 0
    }
    violations.forEach(violation => {
      let impact = violation['impact']
      counter[impact] +=1;
    });
    let score = 15 * counter['critical'] + 
                9 * counter['serious'] + 
                5 * counter['moderate'] +
                1 * counter['minor'];
    score = (score >= 100) ? 100 : score;
    if (score >= 60) { return 'badge-danger'; }
    else if (score < 60 && score >= 20) { return 'badge-warning'; }
    else { return 'badge-success'; }
  }

  toggle(): void {
    this.show = !this.show;
  }
}
