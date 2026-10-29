// Both indexing and queries must use the same model and normalization.
export async function embedFaq(text: string): Promise<number[]> {
  const model = new Supabase.ai.Session('gte-small');
  const vector = await model.run(text, { mean_pool: true, normalize: true });
  if (!Array.isArray(vector) || vector.length !== 384 || !vector.every(Number.isFinite)) {
    throw new Error('Invalid FAQ embedding');
  }
  return vector;
}
