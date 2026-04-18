import { Router, Request, Response } from "express";
import OpenAI from "openai";

const router = Router();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { question, deals, summary } = req.body as {
      question: string;
      deals: {
        name: string;
        value: number;
        probability: number;
        stage: string;
      }[];
      summary: {
        expected: number;
        pipeline: number;
      };
    };

    if (!question) {
      return res.status(400).json({ error: "Question required" });
    }

    const prompt = `
You are a revenue forecasting assistant.

Deals:
${deals
  .map(
    (d) =>
      `${d.name} | Value: ${d.value} | Probability: ${d.probability}% | Stage: ${d.stage}`
  )
  .join("\n")}

Forecast: ${summary.expected}
Pipeline: ${summary.pipeline}

User question:
${question}

Answer clearly with:
1. Insight
2. Risk
3. Action
`;

    const response = await client.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "You are an expert revenue strategist." },
        { role: "user", content: prompt },
      ],
    });

    return res.json({
      answer: response.choices?.[0]?.message?.content || "No response",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "AI failed" });
  }
});

export default router;