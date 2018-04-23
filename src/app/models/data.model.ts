import { Violation } from './violation.model';

export class Data {
    constructor(public last_updated: string, violations: Violation[]) {}
}