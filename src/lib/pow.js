// Copyright (c) 2018-2026, Arm Limited; ported in sharkdp/pastel.
// SPDX-License-Identifier: MIT OR Apache-2.0 WITH LLVM-exception
//
// JavaScript port of the double-precision `pow` of Arm Optimized Routines
// (https://github.com/ARM-software/optimized-routines, math/pow.c, math/pow_log_data.c and math/exp_data.c), for the
// JavaScript port of sharkdp/pastel v0.12.0. Used under the MIT option of its licence:
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { round } from './rustfmt.js';

// The original gets `f64::powf` from the system libm, and V8's `Math.pow` differs from that by one unit in the last
// place in about 10% of the calls. That is visible: the Lab and OkLab channels of a nearly neutral color are
// differences of almost equal `pow` results, so the sign of a channel and the hue depend on those last bits.
// This routine is the `pow` of glibc on Linux since version 2.28. The port follows math/pow.c as compiled for aarch64
// (HAVE_FAST_FMA and TOINT_INTRINSICS), where every `a * b + c` of that source is a fused multiply-add. The tables are
// `__pow_log_data` and `__exp_data` for N = 128, as big-endian IEEE 754 words.

const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);
F64[0] = 1.0;
const HI = U32[1] === 0x3ff00000 ? 1 : 0;
const LO = 1 - HI;

const LN2_HI = 0.6931471805598903;
const LN2_LO = 5.497923018708371e-14;
const A0 = -0.5;
const A1 = -0.6666666666666679;
const A2 = 0.5000000000000007;
const A3 = 0.7999999995323976;
const A4 = -0.6666666663487739;
const A5 = -1.142909628459501;
const A6 = 1.0000415263675542;

const INV_LN2_N = 184.6649652337873;
const NEG_LN2_HI_N = -0.005415212348111709;
const NEG_LN2_LO_N = -1.2864023111638346e-14;
const C2 = 0.49999999999996786;
const C3 = 0.16666666666665886;
const C4 = 0.0416666808410674;
const C5 = 0.008333335853059549;

/** `SIGN_BIAS` of pow.c: added to the exponent index to set the sign bit of the result. */
const SIGN_BIAS = 0x800 << 7;

/** `{invc, logc, logctail}` for each of the 128 subintervals of `__pow_log_data` (without the unused pad field). */
const POW_LOG_WORDS = [
  '3ff6a00000000000bfd62c82f2b9c8003cfab424283756803ff6800000000000bfd5d1bdbf580800bd1ca508d8e0f720',
  '3ff6600000000000bfd5767717455800bd2362a4d5b6506d3ff6400000000000bfd51aad872df800bce684e49eb067d5',
  '3ff6200000000000bfd4be5f95777800bd041b6993293ee03ff6000000000000bfd4618bc21c60003d13d82f484c84cc',
  '3ff5e00000000000bfd404308686a8003cdc42f3ed820b3a3ff5c00000000000bfd3a64c556948003d20b1c686519460',
  '3ff5a00000000000bfd347dd9a9880003d25594dd4c580923ff5800000000000bfd2e8e2bae120003d267b1e99b72bd8',
  '3ff5600000000000bfd2895a13de88003d15ca14b6cfb03f3ff5600000000000bfd2895a13de88003d15ca14b6cfb03f',
  '3ff5400000000000bfd22941fbcf7800bd165a242853da763ff5200000000000bfd1c898c1699800bd1fafbc68e75404',
  '3ff5000000000000bfd1675cababa8003d1f1fc63382a8f03ff4e00000000000bfd1058bf9ae4800bd26a8c4fd055a66',
  '3ff4c00000000000bfd0a324e2739000bd0c6bee7ef4030e3ff4a00000000000bfd0402594b4d000bcf036b89ef42d7f',
  '3ff4a00000000000bfd0402594b4d000bcf036b89ef42d7f3ff4800000000000bfcfb9186d5e40003d0d572aab993c87',
  '3ff4600000000000bfcef0adcbdc60003d2b26b79c86af243ff4400000000000bfce27076e2af000bd172f4f543fff10',
  '3ff4200000000000bfcd5c216b4fc0003d21ba91bbca681b3ff4000000000000bfcc8ff7c79aa0003d27794f689f8434',
  '3ff4000000000000bfcc8ff7c79aa0003d27794f689f84343ff3e00000000000bfcbc286742d90003d194eb0318bb78f',
  '3ff3c00000000000bfcaf3c94e80c0003cba4e633fcd90663ff3a00000000000bfca23bc1fe2b000bd258c64dc46c1ea',
  '3ff3a00000000000bfca23bc1fe2b000bd258c64dc46c1ea3ff3800000000000bfc9525a9cf45000bd2ad1d904c1d4e3',
  '3ff3600000000000bfc87fa06520d0003d2bbdbf7fdbfa093ff3400000000000bfc7ab890210e0003d2bdb9072534a58',
  '3ff3400000000000bfc7ab890210e0003d2bdb9072534a583ff3200000000000bfc6d60fe719d000bd10e46aa3b2e266',
  '3ff3000000000000bfc5ff3070a79000bd1e9e439f1050393ff3000000000000bfc5ff3070a79000bd1e9e439f105039',
  '3ff2e00000000000bfc526e5e3a1b000bd20de8b90075b8f3ff2c00000000000bfc44d2b6ccb80003d170cc16135783c',
  '3ff2c00000000000bfc44d2b6ccb80003d170cc16135783c3ff2a00000000000bfc371fc201e90003cf178864d27543a',
  '3ff2800000000000bfc29552f81ff000bd248d301771c4083ff2600000000000bfc1b72ad52f6000bd2e80a41811a396',
  '3ff2600000000000bfc1b72ad52f6000bd2e80a41811a3963ff2400000000000bfc0d77e7cd090003d0a699688e85bf4',
  '3ff2400000000000bfc0d77e7cd090003d0a699688e85bf43ff2200000000000bfbfec9131dbe000bd2575545ca333f2',
  '3ff2000000000000bfbe27076e2b00003d2a342c2af0003c3ff2000000000000bfbe27076e2b00003d2a342c2af0003c',
  '3ff1e00000000000bfbc5e548f5bc000bd1d0c57585fbe063ff1c00000000000bfba926d3a4ae0003d253935e85baac8',
  '3ff1c00000000000bfba926d3a4ae0003d253935e85baac83ff1a00000000000bfb8c345d631a0003d137c294d2f5668',
  '3ff1a00000000000bfb8c345d631a0003d137c294d2f56683ff1800000000000bfb6f0d28ae56000bd269737c93373da',
  '3ff1600000000000bfb51b073f0620003d1f025b61c65e573ff1600000000000bfb51b073f0620003d1f025b61c65e57',
  '3ff1400000000000bfb341d7961be0003d2c5edaccf913df3ff1400000000000bfb341d7961be0003d2c5edaccf913df',
  '3ff1200000000000bfb16536eea380003d147c5e768fa3093ff1000000000000bfaf0a30c01180003d2d599e83368e91',
  '3ff1000000000000bfaf0a30c01180003d2d599e83368e913ff0e00000000000bfab42dd711980003d1c827ae5d6704c',
  '3ff0e00000000000bfab42dd711980003d1c827ae5d6704c3ff0c00000000000bfa77458f632c000bd2cfc4634f2a1ee',
  '3ff0c00000000000bfa77458f632c000bd2cfc4634f2a1ee3ff0a00000000000bfa39e87b9fec0003cf502b7f526feaa',
  '3ff0a00000000000bfa39e87b9fec0003cf502b7f526feaa3ff0800000000000bf9f829b0e780000bd2980267c7e09e4',
  '3ff0800000000000bf9f829b0e780000bd2980267c7e09e43ff0600000000000bf97b91b07d58000bd288d5493faa639',
  '3ff0400000000000bf8fc0a8b0fc0000bcdf1e7cf6d3a69c3ff0400000000000bf8fc0a8b0fc0000bcdf1e7cf6d3a69c',
  '3ff0200000000000bf7fe02a6b100000bd19e23f0dda40e43ff0200000000000bf7fe02a6b100000bd19e23f0dda40e4',
  '3ff0000000000000000000000000000000000000000000003ff000000000000000000000000000000000000000000000',
  '3fefc000000000003f80101575890000bd10c76b999d2be83fef8000000000003f90205658938000bd23dc5b06e2f7d2',
  '3fef4000000000003f98492528c90000bd2aa0ba325a0c343fef0000000000003fa0415d89e740003d0111c05cf1d753',
  '3feec000000000003fa466aed42e0000bd2c167375bdfd283fee8000000000003fa894aa149fc000bd197995d05a267d',
  '3fee4000000000003faccb73cdddc000bd1a68f247d828073fee2000000000003faeea31c006c000bd0e113e4fc93b7b',
  '3fede000000000003fb1973bd1466000bd25325d560d9e9b3feda000000000003fb3bdf5a7d1e0003d2cc85ea5db4ed7',
  '3fed6000000000003fb5e95a4d97a000bd2c69063c5d1d1e3fed4000000000003fb700d30aeac0003cec1e8da99ded32',
  '3fed0000000000003fb9335e5d5940003d23115c3abd47da3fecc000000000003fbb6ac88dad6000bd1390802bf768e5',
  '3feca000000000003fbc885801bc40003d2646d1c65aacd33fec6000000000003fbec739830a2000bd2dc068afe645e0',
  '3fec4000000000003fbfe89139dbe000bd2534d64fa10afd3fec0000000000003fc1178e8227e0003d21ef78ce2d07f2',
  '3febe000000000003fc1aa2b7e23f0003d2ca78e443899343feba000000000003fc2d1610c8680003d039d6ccb81b4a1',
  '3feb8000000000003fc365fcb01590003cc62fa8234b72893feb4000000000003fc4913d8333b0003d25837954fdb678',
  '3feb2000000000003fc527e5e4a1b0003d2633e8e5697dc73feae000000000003fc6574ebe8c10003d19cf8b2c3c2e78',
  '3feac000000000003fc6f0128b757000bd25118de59c21e13feaa000000000003fc7898d85445000bd1c661070914305',
  '3fea6000000000003fc8beafeb390000bd073d54aae92cd13fea4000000000003fc95a5adcf700003d07f22858a0ff6f',
  '3fea0000000000003fca93ed3c8ae000bd287243505621693fe9e000000000003fcb31d8575bd000bd0c358d4eace1aa',
  '3fe9c000000000003fcbd087383be000bd2d4bc4595412b63fe9a000000000003fcc6ffbc6f01000bcf1ec72c5962bd2',
  '3fe96000000000003fcdb13db0d49000bd2aff2af715b0353fe94000000000003fce530effe710003cc212276041f430',
  '3fe92000000000003fcef5ade4dd0000bcca211565bb8e113fe90000000000003fcf991c6cb3b0003d1bcbecca0cdf30',
  '3fe8c000000000003fd07138604d58003cf89cdb16ed4e913fe8a000000000003fd0c42d676160003d27188b163ceae9',
  '3fe88000000000003fd1178e8227e800bd2c210e63a5f01c3fe86000000000003fd16b5ccbacf8003d2b9acdf7a51681',
  '3fe84000000000003fd1bf99635a68003d2ca6ed5147bdb73fe82000000000003fd214456d0eb8003d0a87deba46baea',
  '3fe7e000000000003fd2bef07cdc90003d2a9cfa4a5004f43fe7c000000000003fd314f1e1d36000bd28e27ad3213cb8',
  '3fe7a000000000003fd36b6776be10003d116ecdb0f177c83fe78000000000003fd3c252773330003d183b54b606bd5c',
  '3fe76000000000003fd419b423d5e8003d08e436ec90e09d3fe74000000000003fd4718dc271c800bd2f27ce0967d675',
  '3fe72000000000003fd4c9e09e173000bd2e20891b0ad8a43fe70000000000003fd522ae0738a0003d2ebe708164c759',
  '3fe6e000000000003fd57bf753c8d0003d1fadedee5d40ef3fe6c000000000003fd5d5bddf596000bd0a0b2a08a465dc',
].join('');

/** `tab` of `__exp_data`: `{tail, scale bits}` for each of the 128 values of 2^(k/128). */
const EXP_WORDS = [
  '00000000000000003ff00000000000003c9b3b4f1a88bf6e3feff63da9fb3335bc7160139cd8dc5d3fefec9a3e778061',
  'bc905e7a108766d13fefe315e86e7f853c8cd2523567f6133fefd9b0d3158574bc8bce8023f98efa3fefd06b29ddf6de',
  '3c60f74e61e6c8613fefc74518759bc83c90a3e45b33d3993fefbe3ecac6f3833c979aa65d837b6d3fefb5586cf9890f',
  '3c8eb51a92fdeffc3fefac922b7247f73c3ebe3d702f9cd13fefa3ec32d3d1a2bc6a033489906e0b3fef9b66affed31b',
  'bc9556522a2fbd0e3fef9301d0125b51bc5080ef8c4eea553fef8abdc06c31ccbc91c923b9d5f4163fef829aaea92de0',
  '3c80d3e3e95c55af3fef7a98c8a58e51bc801b15eaa593483fef72b83c7d517bbc8f1ff055de323d3fef6af9388c8dea',
  '3c8b898c3f1353bf3fef635beb6fcb75bc96d99c7611eb263fef5be084045cd43c9aecf73e3a2f603fef54873168b9aa',
  'bc8fe782cb86389d3fef4d5022fcd91d3c8a6f4144a6c38d3fef463b88628cd63c807a05b0e4047d3fef3f49917ddc96',
  '3c968efde3a8a8943fef387a6e7562383c875e18f274487d3fef31ce4fb2a63f3c80472b981fe7f23fef2b4565e27cdd',
  'bc96b87b3f71085e3fef24dfe1f563813c82f7e16d09ab313fef1e9df51fdee1bc3d219b1a6fbffa3fef187fd0dad990',
  '3c8b3782720c0ab43fef1285a6e4030b3c6e149289cecb8f3fef0cafa93e2f563c834d754db0abb63fef06fe0a31b715',
  '3c864201e2ac744c3fef0170fc4cd8313c8fdd395dd3f84a3feefc08b26416ffbc86a3803b8e5b043feef6c55f929ff1',
  'bc924aedcc4b50683feef1a7373aa9cbbc9907f81b512d8e3feeecae6d05d866bc71d1e83e9436d23feee7db34e59ff7',
  'bc991919b3ce1b153feee32dc313a8e53c859f48a72a4c6d3feedea64c123422bc9312607a28698a3feeda4504ac801c',
  'bc58a78f4817895b3feed60a21f72e2abc7c2c9b67499a1b3feed1f5d950a8973c4363ed60c2ac113feece086061892d',
  '3c9666093b0664ef3feeca41ed1d00573c6ecce1daa103793feec6a2b5c13cd03c93ff8e3f0f12303feec32af0d7d3de',
  '3c7690cebb7aafb03feebfdad5362a273c931dbdeb54e0773feebcb299fddd0dbc8f94340071a38e3feeb9b2769d2ca7',
  'bc87deccdc93a3493feeb6daa2cf6642bc78dec6bd0f385f3feeb42b569d4f82bc861246ec7b5cf63feeb1a4ca5d920f',
  '3c93350518fdd78e3feeaf4736b527da3c7b98b72f8a9b053feead12d497c7fd3c9063e1e21c54093feeab07dd485429',
  '3c34c7855019c6ea3feea9268a5946b73c9432e62b64c0353feea76f15ad2148bc8ce44a6199769f3feea5e1b976dc09',
  'bc8c33c53bef4da83feea47eb03a5585bc845378892be9ae3feea34634ccc320bc93cedd785658583feea23882552225',
  '3c5710aa807e19643feea155d44ca973bc93b3efbf5e22283feea09e667f3bcdbc6a12ad8734b9823feea012750bdabf',
  'bc6367efb86da9ee3fee9fb23c651a2fbc80dc3d54e088513fee9f7df9519484bc781f647e5a3ecf3fee9f75e8ec5f74',
  'bc86ee4ac08b7db03fee9f9a48a58174bc8619321e55e68a3fee9feb564267c93c909ccb5e09d4d33feea0694fde5d3f',
  'bc7b32dcb94da51d3feea11473eb01873c94ecfd5467c06b3feea1ed0130c1323c65ebe1abd66c553feea2f336cf4e62',
  'bc88a1c52fb3cf423feea427543e1a12bc9369b6f13b37343feea589994cce13bc805e843a19ff1e3feea71a4623c7ad',
  'bc94d450d872576e3feea8d99b4492ed3c90ad675b0e8a003feeaac7d98a66993c8db72fc1f0eab43feeace5422aa0db',
  'bc65b6609cc5e7ff3feeaf3216b5448c3c7bf68359f35f443feeb1ae99157736bc93091fa71e3d833feeb45b0b91ffc6',
  'bc5da9b88b6c1e293feeb737b0cdc5e5bc6c23f97c90b9593feeba44cbc8520fbc92434322f4f9aa3feebd829fde4e50',
  'bc85ca6cd7668e4b3feec0f170ca07ba3c71affc2b91ce273feec49182a3f0903c6dd235e10a73bb3feec86319e32323',
  'bc87c504226222633feecc667b5de5653c8b1c86e3e231d53feed09bec4a2d33bc91bbd1d3bcbb153feed503b23e255d',
  '3c90cc319cee31d23feed99e1330b3583c8469846e735ab33feede6b5579fdbfbc82dfcd978e9db43feee36bbfd3f37a',
  '3c8c1a7792cb33873feee89f995ad3adbc907b8f4ad1d9fa3feeee07298db666bc55c3d956dcaeba3feef3a2b84f15fb',
  'bc90a40e3da6f6403feef9728de5593abc68d6f438ad93343feeff76f2fb5e47bc91eee26b588a353fef05b030a1064a',
  '3c74ffd70a5fddcd3fef0c1e904bc1d2bc91bdfbfa9298ac3fef12c25bd71e093c736eae30af0cb33fef199bdd85529c',
  '3c8ee3325c9ffd943fef20ab5fffd07a3c84e08fd10959ac3fef27f12e57d14b3c63cdaf384e1a673fef2f6d9406e7b5',
  '3c676b2c6c9219683fef3720dcef9069bc808a1883ccb5d23fef3f0b555dc3fabc8fad5d3ffffa6f3fef472d4a07897c',
  'bc900dae3875a9493fef4f87080d89f23c74a385a63d07a73fef5818dcfba487bc82919e2040220f3fef60e316c98398',
  '3c8e5a50d5c192ac3fef69e603db32853c843a59ac016b4b3fef7321f301b460bc82d52107b43e1f3fef7c97337b9b5f',
  'bc892ab93b470dc93fef864614f5a1293c74b604603a88d33fef902ee78b3ff63c83c5ec519d72713fef9a51fbc74c83',
  'bc8ff7128fd391f03fefa4afa2a490dabc8dae98e223747d3fefaf482d8e67f13c8ec3bc41aa20083fefba1bee615a27',
  '3c842b94c3a9eb323fefc52b376bba973c8a64a931d185ee3fefd0765b6e4540bc8e37bae43be3ed3fefdbfdad9cbe14',
  '3c77893b4d91cd9d3fefe7c1819e90d83c5305c14160cc893feff3c22b8f71f1',
].join('');

/**
 * Decodes concatenated 16-digit hex words into doubles.
 *
 * @param {string} hex
 * @returns {Float64Array}
 */
function decodeWords(hex) {
  const values = new Float64Array(hex.length / 16);
  for (let i = 0; i < values.length; i += 1) {
    U32[HI] = Number.parseInt(hex.slice(16 * i, 16 * i + 8), 16);
    U32[LO] = Number.parseInt(hex.slice(16 * i + 8, 16 * i + 16), 16);
    values[i] = F64[0];
  }
  return values;
}

const POW_LOG_TAB = decodeWords(POW_LOG_WORDS);
const EXP_TAB = decodeWords(EXP_WORDS);
const EXP_TAB_WORDS = new Uint32Array(EXP_TAB.buffer);

/**
 * A correctly rounded fused multiply-add `a * b + c`, by the algorithm of Boldo and Melquiond ("Emulation of a FMA
 * and correctly rounded sums: proved algorithms using rounding to odd"). The magnitudes in `pow` are far from
 * overflow and underflow, which the algorithm requires.
 *
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @returns {number}
 */
function fma(a, b, c) {
  // a * b = uh + ul exactly (Dekker, Veltkamp)
  const uh = a * b;
  const splitA = 134217729.0 * a;
  const aHigh = splitA - (splitA - a);
  const aLow = a - aHigh;
  const splitB = 134217729.0 * b;
  const bHigh = splitB - (splitB - b);
  const bLow = b - bHigh;
  const ul = aLow * bLow - (uh - aHigh * bHigh - aLow * bHigh - aHigh * bLow);

  // c + ul = th + tl exactly (Knuth)
  const th = c + ul;
  let virtual = th - c;
  const tl = c - (th - virtual) + (ul - virtual);

  // uh + th = vh + vl exactly
  const vh = uh + th;
  virtual = vh - uh;
  const vl = uh - (vh - virtual) + (th - virtual);

  // tl + vl rounded to odd
  const sum = tl + vl;
  virtual = sum - tl;
  const error = tl - (sum - virtual) + (vl - virtual);
  F64[0] = sum;
  if (error !== 0 && (U32[LO] & 1) === 0) {
    if (error > 0 === sum > 0) {
      U32[LO] += 1;
    } else {
      if (U32[LO] === 0) {
        U32[HI] -= 1;
      }
      U32[LO] -= 1;
    }
  }
  return vh + F64[0];
}

/**
 * `specialcase` of pow.c: `scale * (1 + tmp)` for results that may overflow or underflow. The bits of the scale
 * have a computed exponent that may have overflown into the sign bit.
 *
 * @param {number} tmp
 * @param {number} scaleHi high word of the scale bits
 * @param {number} scaleLo low word of the scale bits
 * @param {number} ki the k of the argument reduction, as a signed integer
 * @returns {number}
 */
function powSpecialCase(tmp, scaleHi, scaleLo, ki) {
  if (ki >= 0) {
    U32[HI] = scaleHi - (1009 << 20);
    U32[LO] = scaleLo;
    const scale = F64[0];
    return 2 ** 1009 * fma(scale, tmp, scale);
  }
  const hi = (scaleHi + (1022 << 20)) >>> 0;
  U32[HI] = hi;
  U32[LO] = scaleLo;
  const scale = F64[0];
  // The product is used across basic blocks here, so the compiler did not fuse it.
  const product = scale * tmp;
  let y = scale + product;
  if (Math.abs(y) < 1.0) {
    // Round to the right precision before scaling into the subnormal range to avoid double rounding.
    const one = y < 0.0 ? -1.0 : 1.0;
    const lo = scale - y + product;
    const high = one + y;
    const low = one - high + y + lo;
    y = high + low - one;
    if (y === 0.0) {
      y = hi >>> 31 === 1 ? -0.0 : 0.0;
    }
  }
  return 2 ** -1022 * y;
}

/**
 * The `pow` of the system libm for an ordinary exponent (`f64::powf` in the original). Exponents that are zero, infinite, NaN or
 * of a magnitude below 2^-65 or from 2^63 on, which pastel does not use, are left to `Math.pow`.
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function pow(x, y) {
  F64[0] = y;
  if (((U32[HI] >>> 20 & 0x7ff) - 0x3be) >>> 0 >= 0x43e - 0x3be) {
    return Math.pow(x, y);
  }

  F64[0] = x;
  let ixHi = U32[HI];
  let ixLo = U32[LO];
  let topX = ixHi >>> 20;
  let signBias = 0;
  if ((topX - 0x001) >>> 0 >= 0x7ff - 0x001) {
    // x is negative, zero, subnormal, infinite or NaN
    const odd = Number.isInteger(y) && y % 2 !== 0;
    if (x === 0 || !Number.isFinite(x)) {
      const x2 = ixHi >>> 31 === 1 && odd ? -(x * x) : x * x;
      return y < 0 ? 1 / x2 : x2;
    }
    if (x < 0) {
      if (!Number.isInteger(y)) {
        return Number.NaN;
      }
      if (odd) {
        signBias = SIGN_BIAS;
      }
      ixHi &= 0x7fffffff;
      topX &= 0x7ff;
    }
    if (topX === 0) {
      // Normalize subnormal x so exponent becomes negative.
      F64[0] = x * 2 ** 52;
      ixHi = (U32[HI] & 0x7fffffff) - (52 << 20);
      ixLo = U32[LO];
    }
  }

  // log(x) = k*Ln2 + log(c) + log1p(z/c-1), as a double-double (logHi, logLo)
  const tmpHi = (ixHi - 0x3fe69555) | 0;
  const i = (tmpHi >>> 13) & 127;
  const k = tmpHi >> 20;
  U32[HI] = ixHi - (tmpHi & 0xfff00000);
  U32[LO] = ixLo;
  const z = F64[0];

  const invc = POW_LOG_TAB[3 * i];
  const logc = POW_LOG_TAB[3 * i + 1];
  const logctail = POW_LOG_TAB[3 * i + 2];

  const r = fma(z, invc, -1.0);
  const t1 = fma(k, LN2_HI, logc);
  const t2 = t1 + r;
  const lo1 = fma(k, LN2_LO, logctail);
  const lo2 = t1 - t2 + r;
  const ar = A0 * r;
  const ar2 = r * ar;
  const ar3 = r * ar2;
  const hi = t2 + ar2;
  const lo3 = fma(ar, r, -ar2);
  const lo4 = t2 - hi + ar2;
  const poly = fma(ar2, fma(ar2, fma(r, A6, A5), fma(r, A4, A3)), fma(r, A2, A1));
  const lo = fma(ar3, poly, lo1 + lo2 + lo3 + lo4);
  const logHi = hi + lo;
  const logLo = hi - logHi + lo;

  const ehi = y * logHi;
  const elo = fma(y, logLo, fma(y, logHi, -ehi));

  // exp(ehi + elo) = 2^(k/N) * exp(r), with exp(r) in [2^(-1/2N),2^(1/2N)]
  F64[0] = ehi;
  const absTop = (U32[HI] >>> 20) & 0x7ff;
  let special = false;
  if ((absTop - 0x3c9) >>> 0 >= 0x408 - 0x3c9) {
    if (absTop < 0x3c9) {
      const one = 1.0 + ehi;
      return signBias !== 0 ? -one : one;
    }
    if (absTop >= 0x409) {
      const limit = ehi < 0 ? 0.0 : Number.POSITIVE_INFINITY;
      return signBias !== 0 ? -limit : limit;
    }
    special = true;
  }

  const kd = round(INV_LN2_N * ehi);
  const ki = kd | 0;
  const rr = fma(kd, NEG_LN2_LO_N, fma(kd, NEG_LN2_HI_N, ehi)) + elo;
  const index = 2 * (ki & 127);
  const r2 = rr * rr;
  const tmp = fma(r2 * r2, fma(rr, C5, C4), fma(r2, fma(rr, C3, C2), EXP_TAB[index] + rr));
  const scaleHi = EXP_TAB_WORDS[2 * (index + 1) + HI] + ((ki + signBias) << 13);
  const scaleLo = EXP_TAB_WORDS[2 * (index + 1) + LO];
  if (special) {
    return powSpecialCase(tmp, scaleHi, scaleLo, ki);
  }
  U32[HI] = scaleHi;
  U32[LO] = scaleLo;
  const scale = F64[0];
  return fma(scale, tmp, scale);
}
