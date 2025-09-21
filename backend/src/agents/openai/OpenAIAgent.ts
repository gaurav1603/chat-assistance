import OpenAI from "openai";
import type {Channel,DefaultGenerics,Event,StreamChat}from "stream-chat"
import type { AIAgent } from "../types";
import { OpenAIResponseHandler } from "./OpenAIResponseHandler";
export class OpenAIAgent implements AIAgent{
    private openai?:OpenAI;
    private assistant?:OpenAI.Beta.Assistants.Assistant;
    private openAiThread?:OpenAI.Beta.Threads.Thread;
    private lastInteractionTs=Date.now()
    private handlers:OpenAIResponseHandler[]=[];
    constructor(
        readonly chatClient:StreamChat,
        readonly channel:Channel,
    ){}
    dispose=async()=>{
        this.chatClient.off("message.new",this.handleMessage);
        await this.chatClient.disconnectUser()
        this.handlers.forEach(handler=>handler.dispose())
        this.handlers=[]
    };
    get user(){
        return this.chatClient.user;
    }
    getlastInteraction=():number=>this.lastInteractionTs;
    init=async()=>{
        const apiKey=process.env.OPENAI_API_KEY as string |
        undefined;
        if(!apiKey){
            throw new Error("OpenAI API key is required")
        }
        
    }
}