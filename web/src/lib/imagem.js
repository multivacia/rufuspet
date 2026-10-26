// Reduz a foto no navegador antes de enviar: o nginx aceita até 1 MB por requisição
// e uma foto de celular passa disso. O servidor ainda converte para webp e limita a 1600 px.
const LADO_MAXIMO = 2000;
const BYTES_ALVO = 900 * 1024;
export const BYTES_MAXIMO_ORIGINAL = 10 * 1024 * 1024;

export async function reduzirImagem(arquivo) {
  if (!arquivo.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  if (arquivo.size > BYTES_MAXIMO_ORIGINAL) throw new Error('Foto acima de 10 MB.');

  let bitmap;
  try {
    bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Não foi possível abrir essa imagem. Tente JPG ou PNG.');
  }

  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // PNG com transparência fica com fundo branco, como os cards
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  for (const qualidade of [0.9, 0.8, 0.7, 0.6]) {
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', qualidade));
    if (blob && blob.size <= BYTES_ALVO) return blob;
  }
  throw new Error('Não foi possível reduzir a foto o suficiente.');
}
