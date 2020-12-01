export class DynamicRoutingSlip {
    routes: Array<Route>;
    constructor() {
        this.routes = new Array<Route>();
    }
}

export class Route {
    type: string;
    service: string;
    operation: string;
}