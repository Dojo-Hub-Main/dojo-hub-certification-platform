import { ApiProperty } from '@nestjs/swagger';
import { IsDefined } from 'class-validator';

/**
 * One question's answer, checked while the student is still taking the quiz: a single
 * option index, or an array of them for a question with several correct answers.
 * Anything else is simply marked wrong rather than rejected.
 */
export class CheckAnswerDto {
  @ApiProperty({ oneOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' } }] })
  @IsDefined()
  answer: number | number[];
}
