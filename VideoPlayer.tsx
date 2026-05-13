/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import c from 'classnames';
// FIX: Import React to provide the 'React' namespace for types like React.CSSProperties.
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {timeToSecs} from './utils';

const formatTime = (t: number) =>
  `${Math.floor(t / 60)}:${Math.floor(t % 60)
    .toString()
    .padStart(2, '0')}`;

const highlightTranscriptText = (text: string): React.ReactNode => {
  if (!text) return text;
  
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const regex = /(error|failure|no-go)/gi;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    
    const keyword = match[0].toLowerCase();
    const color = keyword === 'no-go' ? '#0066ff' : '#ff4444';
    
    parts.push(
      <span key={`${match.index}-${match[0]}`} style={{color, fontWeight: 'bold'}}>
        {match[0]}
      </span>
    );
    
    lastIndex = regex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : text;
};

interface Timecode {
  time: string;
  text?: string;
  objects?: string[];
  value?: number | string;
  startTime?: string;
  endTime?: string;
  category?: string | string[];
  description?: string;
  location?: string;
}

interface VideoPlayerProps {
  url: string | null;
  timecodeList: Timecode[] | null;
  requestedTimecode: number | null;
  isLoadingVideo: boolean;
  videoError: boolean;
  jumpToTimecode: (seconds: number | null) => void;
  onDurationChange: (duration: number) => void;
  onCurrentTimeChange?: (seconds: number) => void;
  onGapClick?: (startTime: string, endTime: string) => void;
}

export default function VideoPlayer({
  url,
  timecodeList,
  requestedTimecode,
  isLoadingVideo,
  videoError,
  jumpToTimecode,
  onDurationChange,
  onCurrentTimeChange,
  onGapClick,
}: VideoPlayerProps) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [scrubberTime, setScrubberTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [currentCaptions, setCurrentCaptions] = useState<string[]>([]);
  const [seekSliderValue, setSeekSliderValue] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const currentSecs = duration * scrubberTime || 0;
  const currentPercent = scrubberTime * 100;
  const timecodeListReversed = useMemo(
    () => timecodeList?.slice().reverse(),
    [timecodeList],
  );

  // Transkript kapsama alanlarını hesapla
  const coverageData = useMemo(() => {
    if (!timecodeList || timecodeList.length === 0 || !duration) return null;

    // Her timecode'u bir aralığa dönüştür
    const segments: {start: number; end: number}[] = [];
    const sorted = timecodeList.slice().sort((a, b) => {
      const aStart = timeToSecs(a.startTime || a.time);
      const bStart = timeToSecs(b.startTime || b.time);
      return aStart - bStart;
    });

    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const start = timeToSecs(t.startTime || t.time);
      let end: number;
      if (t.endTime) {
        end = timeToSecs(t.endTime);
      } else {
        // Tek noktalı timecode: sonraki timecode'a kadar veya +10sn (hangisi küçükse)
        const nextStart = i < sorted.length - 1 
          ? timeToSecs(sorted[i + 1].startTime || sorted[i + 1].time)
          : duration;
        end = Math.min(start + 10, nextStart, duration);
      }
      segments.push({start, end});
    }

    // Örtüşen aralıkları birleştir
    const merged: {start: number; end: number}[] = [];
    for (const seg of segments) {
      if (merged.length > 0 && seg.start <= merged[merged.length - 1].end) {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, seg.end);
      } else {
        merged.push({...seg});
      }
    }

    const coveredSeconds = merged.reduce((sum, s) => sum + (s.end - s.start), 0);
    const coveragePercent = Math.min(100, (coveredSeconds / duration) * 100);

    // Boşlukları (gap) hesapla
    const gaps: {start: number; end: number}[] = [];
    if (merged.length > 0) {
      if (merged[0].start > 0) {
        gaps.push({start: 0, end: merged[0].start});
      }
      for (let i = 0; i < merged.length - 1; i++) {
        if (merged[i].end < merged[i + 1].start) {
          gaps.push({start: merged[i].end, end: merged[i + 1].start});
        }
      }
      if (merged[merged.length - 1].end < duration) {
        gaps.push({start: merged[merged.length - 1].end, end: duration});
      }
    }

    return {segments: merged, gaps, coveredSeconds, coveragePercent};
  }, [timecodeList, duration]);

  const togglePlay = useCallback(() => {
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  }, [isPlaying, video]);

  const restartVideo = useCallback(() => {
    if (!video) return;
    video.currentTime = 0;
    setScrubberTime(0);
    setSeekSliderValue(0);
  }, [video]);

  const skip = useCallback((seconds: number) => {
    if (!video) return;
    const newTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    video.currentTime = newTime;
    setScrubberTime(newTime / video.duration);
    setSeekSliderValue((newTime / video.duration) * 100);
  }, [video]);

  const changeSpeed = useCallback((rate: number) => {
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
  }, [video]);

  const handleSeekSliderChange = (value: number) => {
    if (!video) return;
    const seekTime = (value / 100) * duration;
    video.currentTime = seekTime;
    setScrubberTime(value / 100);
    setSeekSliderValue(value);
  };

  const updateDuration = () => {
    if (!video) return;
    setDuration(video.duration);
    onDurationChange?.(video.duration);
  };

  const updateTime = () => {
    if (!video) return;
    onCurrentTimeChange?.(video.currentTime);

    if (!isScrubbing) {
      setScrubberTime(video.currentTime / video.duration);
      setSeekSliderValue((video.currentTime / video.duration) * 100);
    }

    if (timecodeListReversed) {
      const activeTexts: string[] = [];
      
      for (const t of timecodeListReversed) {
        const start = timeToSecs(t.startTime || t.time);
        if (start <= video.currentTime) {
          const specifiedEndSecs = t.endTime ? timeToSecs(t.endTime) : start;
          const effectiveEnd = Math.max(specifiedEndSecs, start + 1);
          
          if (video.currentTime <= effectiveEnd) {
            if (t.text) {
              activeTexts.unshift(t.text);
            }
          }
        }
      }
      setCurrentCaptions(activeTexts.slice(-4));
    }
  };

  const onPlay = () => setIsPlaying(true);
  const onPause = () => setIsPlaying(false);

  useEffect(() => {
    setScrubberTime(0);
    setSeekSliderValue(0);
    setIsPlaying(false);
  }, [url]);

  useEffect(() => {
    if (video && requestedTimecode !== null) {
      video.currentTime = requestedTimecode;
      onCurrentTimeChange?.(requestedTimecode);
      // Video zamanı değiştiğinde play state'ini senkronize et
      setIsPlaying(!video.paused);
      // State'i resetle ki aynı marker'a tekrar tıklanabilsin
      jumpToTimecode(null);
    }
  }, [video, requestedTimecode, jumpToTimecode, onCurrentTimeChange]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof Element &&
        e.target.tagName !== 'INPUT' &&
        e.target.tagName !== 'TEXTAREA'
      ) {
        if (e.key === ' ') {
          e.preventDefault();
          togglePlay();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          skip(-10);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          skip(10);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [togglePlay, skip]);

  return (
    <div className="videoPlayer">
      {url && !isLoadingVideo ? (
        <>
          <div className="videoFrame">
            <video
              src={url}
              ref={setVideo}
              onClick={togglePlay}
              preload="auto"
              crossOrigin="anonymous"
              onDurationChange={updateDuration}
              onTimeUpdate={updateTime}
              onPlay={onPlay}
              onPause={onPause}
            />

            {currentCaptions.length > 0 && (
              <div className="videoCaptionsContainer" aria-live="polite" aria-atomic="true">
                {currentCaptions.map((caption, i) => (
                  <div key={i} className="videoCaption">{highlightTranscriptText(caption)}</div>
                ))}
              </div>
            )}
          </div>

          <div className="videoControls">
            {coverageData && coverageData.segments.length > 0 && (
              <div className="transcriptCoverage">
                <div className="transcriptCoverageBar">
                  {coverageData.segments.map((seg, i) => (
                    <div
                      key={`seg-${i}`}
                      className="transcriptCoverageSegment"
                      style={{
                        left: `${(seg.start / duration) * 100}%`,
                        width: `${((seg.end - seg.start) / duration) * 100}%`,
                      }}
                    >
                      <div className="transcriptCoverageTooltip">
                        {formatTime(seg.start)} - {formatTime(seg.end)} ({formatTime(seg.end - seg.start)})
                      </div>
                    </div>
                  ))}
                  {coverageData.gaps.map((gap, i) => (
                    <div
                      key={`gap-${i}`}
                      className="transcriptCoverageGap"
                      style={{
                        left: `${(gap.start / duration) * 100}%`,
                        width: `${((gap.end - gap.start) / duration) * 100}%`,
                      }}
                      onClick={() => {
                        if (onGapClick) {
                          const fmt = (s: number) => {
                            const h = Math.floor(s / 3600);
                            const m = Math.floor((s % 3600) / 60);
                            const sec = Math.floor(s % 60);
                            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
                          };
                          onGapClick(fmt(gap.start), fmt(gap.end));
                        }
                      }}
                    >
                      <div className="transcriptCoverageTooltip">
                        Boşluk: {formatTime(gap.start)} - {formatTime(gap.end)} ({formatTime(gap.end - gap.start)})
                      </div>
                    </div>
                  ))}
                </div>
                <div className="transcriptCoverageInfo">
                  <span>Transkript Kapsamı: %{coverageData.coveragePercent.toFixed(1)}</span>
                  <span>{formatTime(coverageData.coveredSeconds)} / {formatTime(duration)}</span>
                </div>
              </div>
            )}
            <div className="videoScrubber">
              <input
                style={{'--pct': `${currentPercent}%`} as React.CSSProperties}
                type="range"
                min="0"
                max="1"
                value={scrubberTime || 0}
                step="0.000001"
                onChange={(e) => {
                  if (!video) return;
                  const value = (e.target as HTMLInputElement).valueAsNumber;
                  setScrubberTime(value);
                  video.currentTime = value * duration;
                }}
                onPointerDown={() => setIsScrubbing(true)}
                onPointerUp={() => setIsScrubbing(false)}
              />
            </div>
            <div className="timecodeMarkers">
              {timecodeList?.map(({time, text, value, startTime, endTime}, i) => {
                // Başlangıç zamanı: startTime varsa onu kullan, yoksa time'ı kullan
                const start = startTime || time;
                const startSecs = timeToSecs(start);
                const startPct = (startSecs / duration) * 100;
                
                // Bitiş zamanı: endTime varsa onu kullan, yoksa başlangıç zamanını kullan (nokta marker)
                let widthPct = 0.3; // Varsayılan nokta genişliği (%)
                
                if (endTime) {
                  const endSecs = timeToSecs(endTime);
                  const durationSecs = endSecs - startSecs;
                  widthPct = (durationSecs / duration) * 100;
                  // Minimum ve maksimum genişlik sınırları
                  widthPct = Math.max(0.2, Math.min(widthPct, 100 - startPct));
                }

                return (
                  <div
                    className={c('timecodeMarker', {
                      'has-duration': !!endTime
                    })}
                    key={i}
                    style={{
                      left: `${startPct}%`,
                      width: endTime ? `${widthPct}%` : 'auto'
                    }}>
                    <div
                      className="timecodeMarkerTick"
                      onClick={() => jumpToTimecode(startSecs)}>
                      <div />
                    </div>
                    <div
                      className={c('timecodeMarkerLabel', {right: startPct > 50})}>
                      <div>{endTime ? `${start} - ${endTime}` : time}</div>
                      <p>{highlightTranscriptText(value?.toString() || text || '')}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="videoTime">
              <div className="playControls">
                <button onClick={restartVideo} title="Baştan başlat">
                  <span className="icon">replay</span>
                </button>
                <button onClick={() => skip(-10)} title="10 saniye geri (←)">
                  <span className="icon">replay_10</span>
                </button>
                <button onClick={togglePlay}>
                  <span className="icon">
                    {isPlaying ? 'pause' : 'play_arrow'}
                  </span>
                </button>
                <button onClick={() => skip(10)} title="10 saniye ileri (→)">
                  <span className="icon">forward_10</span>
                </button>
              </div>
              <div className="speedControls">
                <select
                  className="speedSelect"
                  value={playbackRate}
                  onChange={(e) => changeSpeed(parseFloat(e.target.value))}
                  title="Oynatma hızı"
                >
                  {[0.25, 0.5, 0.75, 1, 2, 4, 8, 16].map((rate) => (
                    <option key={rate} value={rate}>
                      {rate}x
                    </option>
                  ))}
                </select>
              </div>
              <div className="timeDisplay">
                {formatTime(currentSecs)} / {formatTime(duration)}
              </div>
            </div>
            
            <div className="seekSliderControls">
              <label>Zamana Git:</label>
              <div className="seekSliderGroup">
                <span className="timeLabel">0:00</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={seekSliderValue}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    setSeekSliderValue(value);
                    handleSeekSliderChange(value);
                  }}
                  className="seekSlider"
                />
                <span className="timeLabel">{formatTime(duration)}</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="emptyVideo">
          <p>
            {isLoadingVideo
              ? 'Video işleniyor...'
              : videoError
                ? 'Video işlenirken hata oluştu.'
                : 'Başlamak için bir video dosyası sürükleyip bırakın.'}
          </p>
        </div>
      )}
    </div>
  );
}