export interface Message {

}

export class BaseMessage implements Message {
    errorMessages: Array<string>;
    constructor() {
        this.errorMessages = new Array<string>();
    }
}

export enum Command {
    Start,
    Shutdown,
    GracefullyShutdown,
    Restart,
    Pause,
    Unpause,
    NetState,
    RegisterStatusListener,
    UnregisterStatusListener,
    RegisterStateChangeListener,
    UnregisterStateChangeListener
}

export class CommandMessage extends BaseMessage {
    type: 'ra.common.messaging.CommandMessage';
    command: Command.NetState;
    constructor() {
        super();
    }
}

export class DocumentMessage extends BaseMessage {
    type: 'ra.common.messaging.DocumentMessage';
    data: Array<Map<string,object>>;
    constructor() {
        super();
        this.data = new Array(new Map<string,object>());
    }
}

export class EventMessage extends BaseMessage {
    type: 'ra.common.messaging.EventMessage';
    constructor() {
        super();
    }
}

export class TextMessage extends BaseMessage {
    type: 'ra.common.messaging.TextMessage';
    constructor() {
        super();
    }
}

export class Email {

}