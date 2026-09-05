import { IsEnum } from 'class-validator';
import { PaymentMethod } from '../../../generated/prisma/enums';

export class PayOrderDto {
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;
}
