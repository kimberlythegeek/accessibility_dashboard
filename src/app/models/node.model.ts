export class Node {
  constructor(
    public failureSummary: string,
    public target: string[],
    public all: Object[],
    public any: Object[],
    public html: string,
    public impact: string,
    public none: Object[]
  ) {}
}
