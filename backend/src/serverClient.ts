import {StreamChat} from "stream-chat"
export const apiKey=process.env.STREAM_API_KEY as string;
export const apiSecretKey=process.env.STREAM_API_SECRET as string;

if(!apiKey || !apiSecretKey){
    throw new Error("Missing required api Key for STREAM_API_SECRET && STREAM_API_KEY")
}

export const serverClient=new StreamChat(apiKey,apiSecretKey);
