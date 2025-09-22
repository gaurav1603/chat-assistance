import OpenAI from "openai";
import type {Channel,DefaultGenerics,Event,StreamChat}from "stream-chat"
import type { AIAgent } from "../types";
import { OpenAIResponseHandler } from "./OpenAIResponseHandler";
import { query } from "express";
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
        this.handlers.forEach((handler)=>handler.dispose())
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
        this.openai = new OpenAI({apiKey})
        // create custom assistance
        this.assistant=await this.openai.beta.assistants.create({
            name:"AI Writing Assistant",
            instructions:this.getWritingAssitantPrompt(),
            model:"gpt-4o",
            tools:[
                {type:"code_interpreter"},
                {
                    type:"function",
                    function:{
                        name:"web-search",
                        description:"Search the web for current information, news, facts or research on any topics",
                        parameters:{
                            type:"object",
                            properties:{
                                query:{
                                    type:"string",
                                    description:"The search query to find information about",
                                },
                            },
                            required:["query"]
                        }
                    }
                }
            ],
            temperature:0.7
        });
        this.openAiThread=await this.openai.beta.threads.create()
        this.chatClient.on("message.now",this.handleMessage)
    };
    private getWritingAssitantPrompt=(context?:string):string=>{
        const currentdate=new Date().toLocaleDateString
        ("en-US",{
            year:"numeric",
            month:"long",
            day:"numeric"
        });
        return `You are an expert AI Writing assistant. Your primary
        purpose is to be a collaborative writing partner.
        ** Your core Capabilities:**
        - Content Creation, Improvement, Style Adaptation,
        BrainStorming, and Writing Coaching.
        - ** Web Search**: You have the ability to search the web for up-to-date
        information using the 'web_search' tool.
        - **Current Date**: Today's date is ${currentdate}. Please use this for any time-sensitive queries.
        **Crucial Instructions:**
        1. **ALWAYS use the 'web_search' tool when the user asks for
        current information, news, or facts.** Your internal knowledge is outdate.
        2. When you use the 'web_search' tool, you will receive a JSON object with search result.** You MUST base your 
        response on the information provided in that search result.**
        Do not rely on your pre-existing knowledge for topics that require current information.
        3. Synthesize the information from the web search to provie a comprehensive
        and accurate answer. Cite sources if the results include URLs.
        **Response Format:**
        - Be direct and production-ready.
        - Use clear formatting.
        - Never begin responses with phrases like "Here's the edit:",
        "Here are the changes:", or similar introductory statements,
        - Provide responses directly and professionally without
        unnecessary preambles.
        ** Writing Context** :${context || "General Writing assistance."}
        Your goal is to private accurate, current and helpful written content. Failure to use web
        search for recent topics will result in an incorrent answer.
        `;
    };
    private handleMessage=async()=>{
        
    }
}