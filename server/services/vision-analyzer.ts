import fs from 'fs';
import { callVilaoChatCompletion, AI_MODELS } from './api-client.js';

export interface VisionAnalysisResult {
  stage: 'STAGE_1_RAW_CARPENTRY' | 'STAGE_2_ASSEMBLY_FINISHING' | 'STAGE_3_DECOR_FLOWERS' | 'STAGE_4_WORSHIP_ALTAR';
  stageName: string;
  aestheticScore: number;
  description: string;
}

/**
 * Phân tích 2-3 frame ảnh đại diện qua model ts/gemini-3.1-flash-lite
 * TUYỆT ĐỐI TIẾT KIỆM: Chỉ gửi frame ảnh, không gửi video!
 */
export async function analyzeVideoFrames(framePaths: string[]): Promise<VisionAnalysisResult> {
  if (framePaths.length === 0) {
    return {
      stage: 'STAGE_2_ASSEMBLY_FINISHING',
      stageName: 'Lắp ráp hoàn thiện tủ thờ',
      aestheticScore: 7.0,
      description: 'Clip không gian thờ tự',
    };
  }

  // Chuyển 2 frame tiêu biểu sang Base64
  const selectedFrames = framePaths.slice(0, 2);
  const imageContents = selectedFrames.map((filePath) => {
    const base64Image = fs.readFileSync(filePath, { encoding: 'base64' });
    return {
      type: 'image_url' as const,
      image_url: {
        url: `data:image/jpeg;base64,${base64Image}`,
      },
    };
  });

  const prompt = `
Bạn là chuyên gia phân loại video về thi công và trang trí Không Gian Thờ Phật / Bàn Thờ Phật.
Hãy quan sát các frame ảnh này và phân loại vào 1 trong 4 giai đoạn sau:

1. STAGE_1_RAW_CARPENTRY: Cảnh thợ mộc làm mộc thô, xẻ gỗ, đóng khung tủ thờ, đánh ráp, xưởng gỗ, chưa hoàn thiện.
2. STAGE_2_ASSEMBLY_FINISHING: Cảnh lắp ráp tủ thờ vào nhà, lắp vách CNC, lau dọn, hoàn thiện phần mộc/tủ.
3. STAGE_3_DECOR_FLOWERS: Cảnh cắm hoa sen/hoa huệ, bày biện lư đồng, mâm ngũ quả, đèn sen, chỉnh trang tượng Phật.
4. STAGE_4_WORSHIP_ALTAR: Bàn thờ đã hoàn thiện trang nghiêm, đèn hào quang sáng rực, thắp hương, cảnh lễ Phật hoặc toàn cảnh không gian thờ thanh tịnh.

YÊU CẦU TRẢ VỀ DUY NHẤT 1 ĐỐI TƯỢNG JSON:
{
  "stage": "STAGE_1_RAW_CARPENTRY" | "STAGE_2_ASSEMBLY_FINISHING" | "STAGE_3_DECOR_FLOWERS" | "STAGE_4_WORSHIP_ALTAR",
  "stageName": "Tên tiếng Việt tương ứng",
  "aestheticScore": 8.5,
  "description": "Mô tả ngắn gọn nội dung cảnh (dưới 25 từ)"
}
`;

  try {
    const content = await callVilaoChatCompletion({
      model: AI_MODELS.VISION,
      serviceType: 'EMBEDDING',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...imageContents,
          ],
        },
      ],
      temperature: 0.2,
    });

    let jsonStr = content.trim();
    // Bóc JSON nếu có markdown block ```json ... ```
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonStr);

    return {
      stage: parsed.stage || 'STAGE_2_ASSEMBLY_FINISHING',
      stageName: parsed.stageName || 'Lắp ráp hoàn thiện tủ thờ',
      aestheticScore: Number(parsed.aestheticScore) || 7.5,
      description: parsed.description || 'Không gian thờ Phật',
    };
  } catch (error) {
    console.error('[VisionAnalyzer] Error analyzing frames:', error);
    return {
      stage: 'STAGE_2_ASSEMBLY_FINISHING',
      stageName: 'Lắp ráp hoàn thiện tủ thờ',
      aestheticScore: 7.0,
      description: 'Không gian thờ tự',
    };
  }
}
