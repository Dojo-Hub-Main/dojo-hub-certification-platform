import { Module } from '@nestjs/common';
import { EvaluatorsService } from './evaluators.service';
import { EvaluatorsController } from './evaluators.controller';

@Module({
  controllers: [EvaluatorsController],
  providers: [EvaluatorsService],
  exports: [EvaluatorsService],
})
export class EvaluatorsModule {}
