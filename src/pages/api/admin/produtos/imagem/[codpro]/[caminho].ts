import db from "@/db/db";
import { log } from "console";
import { NextApiRequest, NextApiResponse } from "next";
import multer from "multer";
import { s3 } from "@/services/s3BackBlaze";

const upload = multer({ storage: multer.memoryStorage() });

export const config = {
  api: {
    bodyParser: false, // Desativa o bodyParser padrão do Next.js para permitir que o multer processe o corpo
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { codpro, caminho } = req.query;
  if (typeof caminho !== "string" || typeof codpro !== "string") {
    return res.status(400).json({ message: "Código do produto ou caminho da imagem não informado" });
  }
  if (req.method === "DELETE") {
    //Pegar nome da imagem para apagar
    const nomeImagem = await db("produto").select(caminho).where({ codpro }).first();

    let imagem = nomeImagem[caminho];

    if (!imagem) {
      return res.status(404).json({ message: "Imagem não encontrada" });
    }

    //Deletar do backbaze e do banco de dados
    try {
      await db("produto")
        .where({ codpro })
        .update({ [caminho]: null });
    } catch (error) {
      log(error);
      return res.status(400).json({ message: "Erro ao deletar imagem" });
    }

    try {
      const params = {
        Bucket: process.env.AWS_BUCKET_NAME ?? "",
        Key: `fotosProdutos/${imagem}`,
      };
      const data = await s3.deleteObject(params).promise();
    } catch (error) {
      log(error);
      return res.status(400).json({ message: "Erro ao deletar imagem" });
    }

    res.status(200).json({ message: "Imagem deletada com sucesso" });
  }

  if (req.method === "POST") {
    upload.single("file")(req as any, {} as any, async (err: any) => {
      if (err) {
        return res.status(500).json({ message: "Erro no upload do arquivo" });
      }

      const file = (req as any).file;

      if (!file) {
        console.log("Arquivo não enviado");
        return res.status(400).json({ message: "Arquivo não enviado" });
      }

      //Atualizar no banco de dados
      try {
        await db("produto")
          .where({ codpro })
          .update({ [caminho]: file.originalname });

        //Enviar para o backblaze
        try {
          // Use file.buffer em vez de ler do sistema de arquivos
          const params = {
            Bucket: process.env.AWS_BUCKET_NAME ?? "",
            Key: `fotosProdutos/${file.originalname}`,
            Body: file.buffer, // file.buffer contém os dados do arquivo
            ContentType: file.mimetype,
          };
          const data = await s3.upload(params).promise();

          return res.status(200).json({ message: "Arquivo enviado com sucesso", path: file.originalname });
        } catch (error) {
          log(error);
          return res.status(400).json({ message: "Erro ao salvar imagem" });
        }
      } catch (error) {
        log(error);
        return res.status(400).json({ message: "Erro ao salvar imagem" });
      }
    });
  }
}
