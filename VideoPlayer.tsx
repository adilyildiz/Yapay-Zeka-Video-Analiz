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

interface Timecode {
  time: string;
  text?: string;
  objects?: string[];
  value?: number | string;
}

interface VideoPlayerProps {
  url: string | null;
  timecodeList: Timecode[] | null;
  requestedTimecode: number | null;
  isLoadingVideo: boolean;
  videoError: boolean;
  jumpToTimecode: (seconds: number) => void;
  onDurationChange: (duration: number) => void;
}

export default function VideoPlayer({
  url,
  timecodeList,
  requestedTimecode,
  isLoadingVideo,
  videoError,
  jumpToTimecode,
  onDurationChange,
}: VideoPlayerProps) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [scrubberTime, setScrubberTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [currentCaption, setCurrentCaption] = useState<string | undefined>();
  const [seekSliderValue, setSeekSliderValue] = useState(0);
  const currentSecs = duration * scrubberTime || 0;
  const currentPercent = scrubberTime * 100;
  const timecodeListReversed = useMemo(
    () => timecodeList?.slice().reverse(),
    [timecodeList],
  );

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
    if (!isScrubbing) {
      setScrubberTime(video.currentTime / video.duration);
      setSeekSliderValue((video.currentTime / video.duration) * 100);
    }

    if (timecodeListReversed) {
      setCurrentCaption(
        timecodeListReversed.find(
          (t) => timeToSecs(t.time) <= video.currentTime,
        )?.text,
      );
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
      // Video zamanı değiştiğinde play state'ini senkronize et
      setIsPlaying(!video.paused);
    }
  }, [video, requestedTimecode]);

  useEffect(() => {
    const onKeyPress = (e: KeyboardEvent) => {
      if (
        e.target instanceof Element &&
        e.target.tagName !== 'INPUT' &&
        e.target.tagName !== 'TEXTAREA' &&
        e.key === ' '
      ) {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keypress', onKeyPress);

    return () => {
      window.removeEventListener('keypress', onKeyPress);
    };
  }, [togglePlay]);

  return (
    <div className="videoPlayer">
      {url && !isLoadingVideo ? (
        <>
          <div>
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

            {currentCaption && (
              <div className="videoCaption">{currentCaption}</div>
            )}
          </div>

          <div className="videoControls">
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
              {timecodeList?.map(({time, text, value}, i) => {
                const secs = timeToSecs(time);
                const pct = (secs / duration) * 100;

                return (
                  <div
                    className="timecodeMarker"
                    key={i}
                    style={{left: `${pct}%`}}>
                    <div
                      className="timecodeMarkerTick"
                      onClick={() => jumpToTimecode(secs)}>
                      <div />
                    </div>
                    <div
                      className={c('timecodeMarkerLabel', {right: pct > 50})}>
                      <div>{time}</div>
                      <p>{value?.toString() || text}</p>
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
                <button onClick={togglePlay}>
                  <span className="icon">
                    {isPlaying ? 'pause' : 'play_arrow'}
                  </span>
                </button>
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