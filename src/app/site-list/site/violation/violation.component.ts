import { Component, Input } from '@angular/core';
import { Violation } from '../../../models/violation.model';

@Component({
  selector: 'app-violation',
  templateUrl: './violation.component.html',
  styleUrls: ['./violation.component.css']
})
export class ViolationComponent {

  @Input() violation: Violation;

  constructor() { }

}
