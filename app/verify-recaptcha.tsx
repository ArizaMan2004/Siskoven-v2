import type { NextApiRequest, NextApiResponse } from "next"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { token } = req.body
  const secret = process.env.RECAPTCHA_SECRET_KEY

  const verifyRes = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `secret=${secret}&response=${token}`,
  })

  const data = await verifyRes.json()
  res.status(200).json(data)
}
