import { Component, OnInit, Input } from '@angular/core';
import { Violation } from '../../../models/violation.model';

@Component({
  selector: 'app-violation',
  templateUrl: './violation.component.html',
  styleUrls: ['./violation.component.css']
})
export class ViolationComponent implements OnInit {

  public show: Boolean;

  @Input() violation: Violation;

  constructor() { }

  ngOnInit() {
    this.violation.nodes.forEach(node => {
      node['any'].forEach(any => {
        const relatedNodes: Object[] = [];
        any['relatedNodes'].forEach(related => {
          relatedNodes.push({
            'target': related['target'],
            'html': related['html']
          });
        });
        node['relatedNodes'] = relatedNodes;
      });
    });
  }
}
