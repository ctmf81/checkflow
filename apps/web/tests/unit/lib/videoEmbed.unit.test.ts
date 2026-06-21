import { describe, it, expect } from 'vitest'
import { videoEmbedUrl, videoProvedor } from '../../../lib/videoEmbed'

describe('videoEmbedUrl()', () => {
  it('YouTube watch URL → embed', () => {
    expect(videoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
  })
  it('youtu.be curto → embed', () => {
    expect(videoEmbedUrl('https://youtu.be/dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
  })
  it('ID puro de 11 chars (legado) → embed', () => {
    expect(videoEmbedUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
  })
  it('Google Drive file/d/ → preview', () => {
    expect(videoEmbedUrl('https://drive.google.com/file/d/1A2b3C4d5E6f/view?usp=sharing'))
      .toBe('https://drive.google.com/file/d/1A2b3C4d5E6f/preview')
  })
  it('Google Drive open?id= → preview', () => {
    expect(videoEmbedUrl('https://drive.google.com/open?id=1A2b3C4d5E6f'))
      .toBe('https://drive.google.com/file/d/1A2b3C4d5E6f/preview')
  })
  it('vazio/nulo → null', () => {
    expect(videoEmbedUrl('')).toBeNull()
    expect(videoEmbedUrl(null)).toBeNull()
    expect(videoEmbedUrl(undefined)).toBeNull()
  })
  it('texto qualquer → null', () => {
    expect(videoEmbedUrl('não é um vídeo')).toBeNull()
    expect(videoEmbedUrl('https://vimeo.com/12345')).toBeNull()
  })
})

describe('videoProvedor()', () => {
  it('detecta youtube e drive', () => {
    expect(videoProvedor('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube')
    expect(videoProvedor('https://drive.google.com/file/d/abc/view')).toBe('drive')
    expect(videoProvedor('xxx')).toBeNull()
  })
})
