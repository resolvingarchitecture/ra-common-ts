// RA Common
import {DID} from './ra-common-identity';
import {Message} from './ra-common-messaging';
import {Route, DynamicRoutingSlip} from './ra-common-route';
export class Envelope {
    id: number;
    dynamicRoutingSlip: DynamicRoutingSlip;
    route: Route;
    did: DID;
    url: string;
    charset: string;
    action: string;
    sensitivity: number;
    serviceLevel: number;
    minDelay: number;
    maxDelay: number;
    message: Message;
}

