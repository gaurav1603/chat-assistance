import { json, text } from "express";
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
        if(!this.openai || !this.openAiThread || !this.run_id){
            return
        }
        // query openai and stop query and resource
        try {
            await this.openai.beta.threads.runs.cancel(
                this.openAiThread.id,
                this.run_id,
                {}
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
    private handleStreamEvent=async(event:OpenAI.Beta.Assistants.AssistantStreamEvent)=>{
        // handling different cases
        const {cid,id}=this.message
        // cid -- channel id and id is id of message itself
        if(event.event==="thread.run.created"){
            this.run_id=event.data.id
        }
        else if(event.event==="thread.message.delta"){
            const textdelta=event.data.delta.content?.[0]
            if(textdelta?.type==="text" && textdelta.text){
                this.message.text+=textdelta.text.value ||""
                // we want date because we don't continue stream  because this can be overwhemling client
                const now=Date.now()
                if(now-this.last_update_time>1000){
                    this.chatClient.partialUpdateMessage(id,{
                        set:{
                            text:this.message_text
                        }
                    })
                    this.last_update_time=now
                }
                this.chunk_counter+=1
            }
        }
        else if(event.event==="thread.message.completed"){
            this.chatClient.partialUpdateMessage(id,{
                set:{
                    text:event.data.content[0].type==="text"?event.data.content[0].text.value:this.message_text
                }
            })
            this.channel.sendEvent({
                type:"ai_indicator.clear",
                cid:cid,
                message_id:id
            })
        }
        else if(event.event==="thread.run.step.created"){
            if(event.data.step_details.type==="message_creation"){
                this.channel.sendEvent({
                    type:"ai_indicator.update",
                    ai_state:"AI_STATE_GENERATING",
                    cid:cid,
                    message_id:id
                })
            }
        }
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
                // message:error.toString(),
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
    run =async()=>{
        const {cid,id:message_id}=this.message;
        let iscompleted=false;
        let outputs=[];
        let currentstream:AssistantStream=this.assistantStream;
        try {
            while(!iscompleted){
                for await (const event of currentstream){
                    this.handleStreamEvent(event);
                    if(event.event==="thread.run.requires_action" && 
                        event.data.required_action?.type==="submit_tool_outputs"
                    ){
                        this.run_id=event.data.id;
                        await this.channel.sendEvent({
                            type:"ai_indicator.update",
                            ai_state:"AI_STATE_EXTERNAL_SOURCES",
                            cid:cid,
                            message_id:message_id
                        })
                        const toolcalls=
                        event.data.required_action.submit_tool_outputs.tool_calls;
                        outputs=[];
                        for(const toolcall of toolcalls){
                            if(toolcall.function.name==="web_search"){
                                try {
                                    const args=JSON.parse(toolcall.function.arguments);
                                    const searchResult=await this.performWebSearch(args.query);
                                    outputs.push({
                                        tool_call_id:toolcall.id,
                                        outputs:searchResult
                                    })
                                } catch (error) {
                                    console.error("Web search failed due to ",error)
                                    outputs.push({
                                        tool_call_id:toolcall.id,
                                        output:JSON.stringify({error:"Failed to call tool"})
                                    })
                                }
                            }
                        }
                        break;
                    }
                    if(event.event==="thread.run.completed"){
                        iscompleted=true;
                        break;
                    }
                    if(event.event==="thread.run.failed"){
                        iscompleted=true;
                        await this.handleError(
                            new Error(event.data.last_error?.message??"Run Failed")
                        )
                        break;
                    }
                    if(iscompleted){
                        break;
                    }
                    if(outputs.length>0){
                        currentstream=this.openai.beta.threads.runs.submitToolOutputsStream(
                            this.openAiThread.id,
                            this.run_id,
                            {
                                tool_outputs:outputs
                            }
                        )
                        outputs=[];
                    }
                }
            }
        } catch (error) {
            console.error("An error occurred during the run:",error)

        }
    }
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