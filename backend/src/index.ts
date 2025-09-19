import cors from "cors"
import "dotenv/config";
import express from "express"
import { apiKey } from "./serverClient";

const app=express()
app.use(express.json())
app.use(cors({origin:"*"}))
app.get("/",(req,res)=>{
    res.json({
        message:"AI writing Assitant server is running",
        apiKey:apiKey,
    });
});
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>{
    console.log(`SERVER IS RUNNING AT http://localhost:${PORT}`)
})