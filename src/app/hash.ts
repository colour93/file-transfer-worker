import SparkMD5 from "spark-md5"

const CHUNK_SIZE = 4 * 1024 * 1024

export async function md5File(file: File, onProgress?: (value: number) => void) {
  const spark = new SparkMD5.ArrayBuffer()
  const chunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))
  for (let index = 0; index < chunks; index += 1) {
    const start = index * CHUNK_SIZE
    spark.append(await file.slice(start, Math.min(file.size, start + CHUNK_SIZE)).arrayBuffer())
    onProgress?.((index + 1) / chunks)
  }
  return spark.end()
}
