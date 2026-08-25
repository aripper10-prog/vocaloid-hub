import { getServiceSupabase } from '../lib/supabase';
import { parseDescription } from '../lib/parser';

const supabase = getServiceSupabase();

export async function linkSongRelations(
  childSongId: string,
  description: string,
  title: string,
  tags: string[] = []
) {
  const parsed = parseDescription(description, title, tags);
  if (!parsed.originalSource) return;

  const { originalSource } = parsed;
  console.log(`[Linker] Original detected for "${title}": ${originalSource.platform}:${originalSource.videoId} (${originalSource.relationType})`);

  try {
    // 1. 本家楽曲（親）がDBに既に存在するか確認
    let { data: parentSong } = await supabase
      .from('songs')
      .select('id')
      .eq('video_id', originalSource.videoId)
      .maybeSingle();

    // 2. まだ親楽曲がDBにない場合、プレースホルダーとして仮登録
    if (!parentSong) {
      const { data: placeholderSong, error: placeholderError } = await supabase
        .from('songs')
        .insert({
          video_id: originalSource.videoId,
          platform: originalSource.platform,
          title: `[原曲] 検出元: ${originalSource.videoId}`,
          vocal_type: 'vocaloid',
          thumbnail_url: originalSource.platform === 'youtube'
            ? `https://i.ytimg.com/vi/${originalSource.videoId}/hqdefault.jpg`
            : '',
        })
        .select('id')
        .single();

      if (placeholderError) {
        console.error('[Linker] Failed to create placeholder parent:', placeholderError.message);
        return;
      }
      parentSong = placeholderSong;
    }

    // 3. 親子関係を song_relations に登録（同一楽曲の自己参照は除外）
    if (parentSong && parentSong.id !== childSongId) {
      const { error: relError } = await supabase
        .from('song_relations')
        .upsert(
          {
            parent_song_id: parentSong.id,
            child_song_id: childSongId,
            relation_type: originalSource.relationType,
          },
          { onConflict: 'parent_song_id,child_song_id' }
        );

      if (relError) {
        console.error('[Linker] Relation upsert error:', relError.message);
      } else {
        console.log(`[Linker] Linked: Parent(${parentSong.id}) -> Child(${childSongId})`);
      }
    }
  } catch (err) {
    console.error('[Linker] Unexpected error linking relations:', err);
  }
}