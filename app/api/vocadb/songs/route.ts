const vocaItems = (vocaData.items || []).map((item: any) => {
      const youtubePv = (item.pvs || []).find((p: any) => p.service === 'Youtube');
      const niconicoPv = (item.pvs || []).find((p: any) => p.service === 'NicoNicoDouga');

      const mappedCredits = (item.artists || []).map((art: any) => {
        // VocaDBのrolesは文字列配列、あるいは文字列そのものの可能性があるため安全に処理
        const rawRoles = art.roles || art.effectiveRoles || [];
        const roles = Array.isArray(rawRoles) ? rawRoles.map((r: any) => String(r).toLowerCase()) : [];
        const artistType = (art.artistType || art.artist?.artistType || '').toLowerCase();
        const artistName = (art.name || art.artist?.name || '').toLowerCase();
        
        let derivedRole = 'music';

        // 1. ロール文字列やアーティストタイプによる厳密な判定
        const isLyricist = roles.includes('lyricist') || roles.includes('作詞');
        const isComposer = roles.includes('composer') || roles.includes('arranger') || roles.includes('作曲') || roles.includes('編曲');
        const isVocalist = roles.includes('vocalist') || roles.includes('vocal') || roles.includes('singer') || roles.includes('ボーカル') || roles.includes('歌唱') || artistType === 'vocaloid' || artistType === 'vocalist' || artistType === 'utau' || artistType === 'othervoice synthesizer';
        const isMixer = roles.includes('mixer') || roles.includes('mastering') || roles.includes('mix') || roles.includes('mix/mastering');
        const isIllustrator = roles.includes('illustrator') || roles.includes('art') || artistType === 'illustrator';
        const isAnimator = roles.includes('animator') || roles.includes('vj') || artistType === 'animator';
        const isTuning = roles.includes('voicemanipulator') || roles.includes('tuning') || roles.includes('調声');

        if (isLyricist && !isComposer) {
          derivedRole = 'lyrics';
        } else if (isVocalist) {
          derivedRole = 'singer';
        } else if (isIllustrator) {
          derivedRole = 'illust';
        } else if (isAnimator) {
          derivedRole = 'movie';
        } else if (isMixer) {
          derivedRole = 'mix';
        } else if (isTuning) {
          derivedRole = 'tuning';
        } else if (isComposer || artistType === 'producer' || artistType === 'circle') {
          derivedRole = 'music';
        } else {
          // それ以外の場合、名前やアーティストタイプから推測
          if (artistType === 'vocaloid' || artistType === 'utau') {
            derivedRole = 'singer';
          } else {
            derivedRole = 'music';
          }
        }

        return {
          role: derivedRole,
          creatorName: art.name || art.artist?.name || 'Unknown',
        };
      });

      return {
        ...item,
        title: item.name || item.title || 'Untitled',
        thumbUrl: item.thumbUrl || youtubePv?.thumbUrl || niconicoPv?.thumbUrl || '',
        youtubeId: youtubePv?.pvId || item.youtubeId,
        niconicoId: niconicoPv?.pvId || item.niconicoId,
        artists: Array.isArray(item.artists) ? item.artists : [],
        pvs: Array.isArray(item.pvs) ? item.pvs : [],
        tags: Array.isArray(item.tags) ? item.tags : [],
        credits: mappedCredits.length > 0 ? mappedCredits : (Array.isArray(item.credits) ? item.credits : []),
        artistString: item.artistString || '',
      };
    });
