export class Violation {
    constructor(
        public description: string,
        public nodes: Object[],
        public impact: string,
        public helpUrl: string,
        public tags: string[],
        public id: string,
        public help: string
    ) {}
}
