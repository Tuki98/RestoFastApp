import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AddOrderItemDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(99)
  @Type(() => Number)
  quantity!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  notes?: string;
}

export class AddOrderItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AddOrderItemDto)
  items!: AddOrderItemDto[];
}
