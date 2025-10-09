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
import {FunctionDeclaration, Type} from '@google/genai';

const functions: FunctionDeclaration[] = [
  {
    name: 'set_timecodes',
    description: 'Zaman kodlu video analiz sonuçları sağla',
    parameters: {
      type: Type.OBJECT,
      properties: {
        timecodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              time: {
                type: Type.STRING,
                description: 'SS:DD:SS formatında zaman damgası',
              },
              text: {
                type: Type.STRING,
                description: 'Türkçe analiz metni',
              },
            },
            required: ['time', 'text'],
          },
        },
      },
      required: ['timecodes'],
    },
  },
  {
    name: 'set_timecodes_with_objects',
    description: 'Nesne tespiti ile zaman kodlu analiz sağla',
    parameters: {
      type: Type.OBJECT,
      properties: {
        timecodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              time: {
                type: Type.STRING,
                description: 'SS:DD:SS formatında zaman damgası',
              },
              text: {
                type: Type.STRING,
                description: 'Türkçe analiz metni',
              },
              objects: {
                type: Type.ARRAY,
                items: {
                  type: Type.STRING,
                },
              },
            },
            required: ['time', 'text', 'objects'],
          },
        },
      },
      required: ['timecodes'],
    },
  },
  {
    name: 'set_categorical_timecodes',
    description: 'Kategorik süreç analizi için yapılandırılmış zaman kodları sağla',
    parameters: {
      type: Type.OBJECT,
      properties: {
        categoricalTimecodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              startTime: {
                type: Type.STRING,
                description: 'Olayın başlangıç zamanı SS:DD:SS.X formatında (0.1 saniye hassasiyeti, örn: 00:01:23.4)',
              },
              endTime: {
                type: Type.STRING,
                description: 'Olayın bitiş zamanı SS:DD:SS.X formatında (0.1 saniye hassasiyeti, örn: 00:01:25.7)',
              },
              category: {
                type: Type.STRING,
                description: 'Olay kategorisi (kullanıcının verdiği kategori adını aynen kullan)',
              },
              description: {
                type: Type.STRING,
                description: 'Olayın detaylı açıklaması (Türkçe)',
              },
              location: {
                type: Type.STRING,
                description: 'Ekrandaki konum (opsiyonel)',
              },
            },
            required: ['startTime', 'endTime', 'category', 'description'],
          },
        },
      },
      required: ['categoricalTimecodes'],
    },
  },
  {
    name: 'set_timecodes_with_numeric_values',
    description: 'Zaman kodlu sayısal analiz sağla',
    parameters: {
      type: Type.OBJECT,
      properties: {
        timecodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              time: {
                type: Type.STRING,
                description: 'SS:DD:SS formatında zaman damgası',
              },
              value: {
                type: Type.NUMBER,
                description: 'Sayısal değer',
              },
            },
            required: ['time', 'value'],
          },
        },
      },
      required: ['timecodes'],
    },
  },
];

export default functions;
