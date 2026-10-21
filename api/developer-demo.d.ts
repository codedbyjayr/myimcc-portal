export default function handler(request: {method:string;url:string;headers:Record<string,string>;body?:unknown}, response: {
  setHeader(name:string,value:string):void;
  status(code:number):unknown;
  json(value:unknown):unknown;
  send(value:string):unknown;
}):Promise<unknown>;
