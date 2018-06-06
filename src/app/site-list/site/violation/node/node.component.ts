import { Component, OnInit, Input } from '@angular/core';
import { Node } from '../../../../models/node.model';

@Component({
  selector: 'app-node',
  templateUrl: './node.component.html'
})
export class NodeComponent implements OnInit {

  @Input() node: Node;

  constructor() {
   }

   ngOnInit() {
    this.node['failureSummary'] = this.node['failureSummary'].replace(/\n/g, '<br>');
   }

}
