import { Component, Input } from '@angular/core';
import { Site } from '../../models/site.model';

@Component({
  selector: 'app-site',
  templateUrl: './site.component.html',
  styleUrls: ['./site.component.css']
})
export class SiteComponent {

  @Input() site: Site;

  title = 'Site';

  constructor() { }

  ngOnInit() {
  }

}
