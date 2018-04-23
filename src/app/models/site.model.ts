import { Data } from './data.model';

export class Site {
    constructor(public name: string, public url: string, public data: Data) {}
}
