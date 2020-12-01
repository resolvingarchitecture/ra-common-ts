export interface Addressable {
    getFingerprint(): string;
    setFingerprint(fingerprint: string): void;
    getAddress(): string;
    setAddress(address: string): void;
}

export class Hash {

}