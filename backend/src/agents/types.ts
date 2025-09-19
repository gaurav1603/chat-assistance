import {Channel, StreamChat,User} from "stream-chat"
// define structure of variables
export interface AIAgent{
    user?:User,
    channel:Channel,
    chatClient:StreamChat,
    getLastInteraction:()=>number
    init:()=>Promise<void>;
    dispose:()=>Promise<void>;
}
export enum AgentPlatform{
    OPENAI="openai",
    WRITING_ASSISTANCE="writing_assistant",
}
export interface WritingMessage{
    custom?:{
        suggestions?:string[]
        writingTask?:string
        messageType?:"user_input" | "ai_response" | "system_message";
        
    }
}