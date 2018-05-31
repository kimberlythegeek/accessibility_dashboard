import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html'
})
export class HeaderComponent implements OnInit {

  brandURL = '../../assets/brand.svg';

  constructor() { }

  ngOnInit() {
  }

}
