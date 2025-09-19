import { json } from "express";
import OpenAI from "openai";
import type {AssistantStream} from "openai/lib/AssistantStream"
import type {Channel,Event,MessageResponse, StreamChat} from "stream-chat"

export class OpenAIResponseHandler{
    // ai response
    private message_text=""
    // number of text chunks receive
    private chunk_counter=0
    // openai run identifier
    private run_id=""
    // private 
    private isdone=false
    private last_update_time=0
    constructor(private readonly openai:OpenAI,
        private readonly openAiThread:OpenAI.Beta.Threads.Thread,
        private readonly assistantStream:AssistantStream,
        private readonly chatClient:StreamChat,
        private readonly channel:Channel,
        private readonly message:MessageResponse,
        private readonly onDispose:()=>void
    ){
        this.chatClient.on("ai_indicator.stop",this.handleStopGenerating)
    }

    private handleStopGenerating=async(event:Event)=>{
        // if all done then return
        if(this.isdone || event.message_id!==this.message.id){
            return
        }
        console.log("Stop Generating for Message",this.message.id);
        // if any instane is not present then return
        if(!this.openai || this.openAiThread || !this.run_id){
            return
        }
        // query openai and stop query and resource
        try {
            await this.openai.beta.threads.runs.cancel(
                this.openAiThread.id,
                this.run_id
            );
        } catch (error) {
            console.log("Error cancelling run",error)
        }
        // 
        await this.channel.sendEvent({
            type:"ai_indicator.clear",
            cid:this.message.cid,
            message_id:this.message.id
        });
        await this.dispose()
    }
    private handleStreamEvent=async(event:Event)=>{
        
    }
    private handleError=async(error:Error)=>{
        if(this.isdone){
            return 
        }
        await this.channel.sendEvent({
            type:"ai_indicator.update",
            ai_state:"AI_STATE_ERROR",
            cid:this.message.cid,
            message_id:this.message.id
        })
        await this.chatClient.partialUpdateMessage(this.message.id,{
            set:{
                text:error.message??"Error Generating the message",
                message:error.toString(),
            } 
        })
        await this.dispose();
    }
    private performWebSearch=async(query:string):Promise<string>=>{
        const TAVILY_API_KEY=process.env.TAVILY_API_KEY
        if(!TAVILY_API_KEY){
            return JSON.stringify({
                error:"Web Search is not available, API key not configured"
            })
        }
        console.log(`Performing a web search for ${query}`)
        try {
            const response=await fetch("https://api.tavily.com/search",{
                method:"POST",
                headers:{
                    "Content-Type":"application/json",
                    "Authorization":`Bearer ${TAVILY_API_KEY}`
                },
                body:JSON.stringify({
                    query:query,
                    search_depth:"advanced",
                    max_results:5,
                    include_answer:true,
                    include_raw_content:false,
                })
            })
            if(!response.ok){
                const error=await response.text()
                console.log(`Tavily Search Failed for query ${query}`,error)
                return JSON.stringify({
                    error:`Search failed with status :${response.status}`,
                    details:error
                })
            }
            const data=await response.json()
            console.log(`Tavily Search successful for query ${query}`)
            return JSON.stringify(data)
        } catch (error) {
            console.error(`An Exception occurred during web search for ${query}`)
            return JSON.stringify({
                error:"An Exception occurred during web search",

            })
        }
    }
    run =async()=>{}
    // cleaning up all resource
    dispose =async()=>{
        if(this.isdone){
            return
        }
        this.isdone=true
        this.chatClient.off("ai-indicater.stop",this.handleStopGenerating)
        this.onDispose()
    }
}